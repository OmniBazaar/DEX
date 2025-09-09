/**
 * Raft Consensus for DEX Order Book Synchronization
 * 
 * Implements Raft consensus algorithm for distributed order book state
 * across multiple validator nodes to ensure consistency.
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

/**
 * Raft node state enumeration
 */
export enum NodeState {
  FOLLOWER = 'FOLLOWER',
  CANDIDATE = 'CANDIDATE',
  LEADER = 'LEADER'
}

// Command types for the consensus protocol
interface OrderCommand {
  type: 'place_order' | 'cancel_order' | 'update_order';
  orderId: string;
  data: Record<string, unknown>;
}

interface StateCommand {
  type: 'state_sync';
  data: Record<string, unknown>;
}

type RaftCommand = OrderCommand | StateCommand;

interface LeaderState {
  term: number;
  commitIndex: number;
  events: LogEntry[];
}

interface AppendEntriesData {
  term: number;
  leaderId: string;
  prevLogIndex: number;
  prevLogTerm: number;
  entries: LogEntry[];
  leaderCommit: number;
}

interface ConsensusStatus {
  nodeId: string;
  state: NodeState;
  term: number;
  votedFor: string | null;
  logLength: number;
  commitIndex: number;
  lastApplied: number;
}

/**
 * Raft cluster node configuration
 */
export interface RaftNode {
  /** Unique node identifier */
  id: string;
  /** Network address */
  address: string;
  /** Network port */
  port: number;
}

/**
 * Raft log entry structure
 */
export interface LogEntry {
  /** Raft term when entry was created */
  term: number;
  /** Log entry index */
  index: number;
  /** Command to execute */
  command: RaftCommand;
  /** Entry creation timestamp */
  timestamp: number;
}

/**
 * Raft consensus configuration
 */
export interface RaftConfig {
  /** Current node identifier */
  nodeId: string;
  /** List of cluster nodes */
  nodes: RaftNode[];
  /** Election timeout in milliseconds */
  electionTimeout: number;
  /** Heartbeat interval in milliseconds */
  heartbeatInterval: number;
}

/**
 * Raft consensus implementation for distributed order book state
 */
export class RaftConsensus extends EventEmitter {
  private config: RaftConfig;
  private state: NodeState = NodeState.FOLLOWER;
  private currentTerm = 0;
  private votedFor: string | null = null;
  private log: LogEntry[] = [];
  private commitIndex = 0;
  private lastApplied = 0;
  
  // Leader state
  private nextIndex: Map<string, number> = new Map();
  private matchIndex: Map<string, number> = new Map();
  
  // Timers
  private electionTimer?: ReturnType<typeof setTimeout>;
  private heartbeatTimer?: ReturnType<typeof setTimeout>;
  
  /**
   * Creates a new RaftConsensus instance
   * @param config - Raft configuration settings
   */
  constructor(config: RaftConfig) {
    super();
    this.config = config;
    this.resetElectionTimer();
  }

  /**
   * Get current leader state
   * @returns Promise resolving to current leader state
   */
  async getLeaderState(): Promise<LeaderState> {
    if (this.state !== NodeState.LEADER) {
      // Forward to leader
      const leader = await this.findLeader();
      if (leader !== null) {
        return this.forwardToLeader(leader, 'getState') as Promise<LeaderState>;
      }
      throw new Error('No leader available');
    }
    
    // Return current committed state
    return {
      term: this.currentTerm,
      commitIndex: this.commitIndex,
      events: this.log.slice(0, this.commitIndex + 1)
    } as LeaderState;
  }

  /**
   * Propose a new command (only leader can accept)
   * @param command - The command to propose for consensus
   * @returns Promise resolving to true if command was committed
   */
  async proposeCommand(command: RaftCommand): Promise<boolean> {
    if (this.state !== NodeState.LEADER) {
      const leader = await this.findLeader();
      if (leader !== null) {
        return this.forwardToLeader(leader, 'propose', command) as Promise<boolean>;
      }
      return false;
    }

    // Append to log
    const entry: LogEntry = {
      term: this.currentTerm,
      index: this.log.length,
      command,
      timestamp: Date.now()
    };
    
    this.log.push(entry);
    
    // Replicate to followers
    const success = await this.replicateEntry(entry);
    
    if (success) {
      this.commitIndex = entry.index;
      this.emit('committed', entry);
      return true;
    }
    
    return false;
  }

  /**
   * Start election timeout
   */
  private resetElectionTimer(): void {
    if (this.electionTimer !== undefined) {
      clearTimeout(this.electionTimer);
    }
    
    // Randomize timeout to prevent split votes
    const timeout = this.config.electionTimeout + 
      Math.floor(Math.random() * this.config.electionTimeout);
    
    this.electionTimer = setTimeout(() => {
      void this.startElection();
    }, timeout);
  }

  /**
   * Start leader election
   */
  private async startElection(): Promise<void> {
    this.state = NodeState.CANDIDATE;
    this.currentTerm++;
    this.votedFor = this.config.nodeId;
    
    logger.info(`Node ${this.config.nodeId} starting election for term ${this.currentTerm}`);
    
    // Vote for self
    let votes = 1;
    const votesNeeded = Math.floor(this.config.nodes.length / 2) + 1;
    
    // Request votes from other nodes
    const votePromises = this.config.nodes
      .filter(node => node.id !== this.config.nodeId)
      .map(node => this.requestVote(node));
    
    const results = await Promise.allSettled(votePromises);
    
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        votes++;
      }
    }
    
    if (votes >= votesNeeded && this.state === NodeState.CANDIDATE) {
      this.becomeLeader();
    } else {
      this.becomeFollower();
    }
  }

  /**
   * Request vote from another node
   * @param node - The node to request a vote from
   * @returns Promise resolving to true if vote was granted
   */
  private requestVote(node: RaftNode): Promise<boolean> {
    // This would make an RPC call to the other node
    // For now, simulate with random response
    const granted = Math.random() > 0.3;
    
    logger.debug(`Vote request to ${node.id}: ${granted ? 'granted' : 'denied'}`);
    
    return Promise.resolve(granted);
  }

  /**
   * Become the leader
   */
  private becomeLeader(): void {
    this.state = NodeState.LEADER;
    logger.info(`Node ${this.config.nodeId} became leader for term ${this.currentTerm}`);
    
    // Initialize leader state
    for (const node of this.config.nodes) {
      if (node.id !== this.config.nodeId) {
        this.nextIndex.set(node.id, this.log.length);
        this.matchIndex.set(node.id, 0);
      }
    }
    
    // Stop election timer
    if (this.electionTimer !== undefined) {
      clearTimeout(this.electionTimer);
    }
    
    // Start heartbeat
    this.sendHeartbeat();
  }

  /**
   * Become a follower
   */
  private becomeFollower(): void {
    this.state = NodeState.FOLLOWER;
    this.votedFor = null;
    
    if (this.heartbeatTimer !== undefined) {
      clearTimeout(this.heartbeatTimer);
    }
    
    this.resetElectionTimer();
  }

  /**
   * Send heartbeat to all followers
   */
  private sendHeartbeat(): void {
    if (this.state !== NodeState.LEADER) return;
    
    // Send AppendEntries RPC to each follower
    for (const node of this.config.nodes) {
      if (node.id !== this.config.nodeId) {
        void this.sendAppendEntries(node);
      }
    }
    
    // Schedule next heartbeat
    this.heartbeatTimer = setTimeout(() => {
      this.sendHeartbeat();
    }, this.config.heartbeatInterval);
  }

  /**
   * Send AppendEntries RPC
   * @param node - Target node to send entries to
   */
  private async sendAppendEntries(node: RaftNode): Promise<void> {
    const nextIdx = this.nextIndex.get(node.id) ?? 0;
    const prevLogIndex = nextIdx - 1;
    const prevLogTerm = prevLogIndex >= 0 && this.log[prevLogIndex] !== undefined ? this.log[prevLogIndex].term : 0;
    
    const entries = this.log.slice(nextIdx);
    
    // This would make an RPC call
    const success = await this.appendEntriesToNode(node, {
      term: this.currentTerm,
      leaderId: this.config.nodeId,
      prevLogIndex,
      prevLogTerm,
      entries,
      leaderCommit: this.commitIndex
    });
    
    if (success) {
      // Update indices
      if (entries.length > 0) {
        this.nextIndex.set(node.id, nextIdx + entries.length);
        this.matchIndex.set(node.id, nextIdx + entries.length - 1);
      }
    } else {
      // Decrement nextIndex and retry
      this.nextIndex.set(node.id, Math.max(1, nextIdx - 1));
    }
  }

  /**
   * Simulate AppendEntries RPC
   * @param _node - Target node (unused in simulation)
   * @param _data - AppendEntries data (unused in simulation)
   * @returns Promise resolving to true if entries were accepted
   */
  private appendEntriesToNode(_node: RaftNode, _data: AppendEntriesData): Promise<boolean> {
    // This would make an actual RPC call
    // For now, simulate success
    return Promise.resolve(Math.random() > 0.1);
  }

  /**
   * Replicate entry to majority of nodes
   * @param _entry - Log entry to replicate (unused in current implementation)
   * @returns Promise resolving to true if majority accepted the entry
   */
  private async replicateEntry(_entry: LogEntry): Promise<boolean> {
    const replicationPromises = this.config.nodes
      .filter(node => node.id !== this.config.nodeId)
      .map(node => this.sendAppendEntries(node));
    
    const results = await Promise.allSettled(replicationPromises);
    
    const successes = results.filter(r => r.status === 'fulfilled').length;
    const majority = Math.floor(this.config.nodes.length / 2) + 1;
    
    return successes + 1 >= majority; // +1 for self
  }

  /**
   * Find current leader
   * @returns Promise resolving to the current leader node or null if none found
   */
  private findLeader(): Promise<RaftNode | null> {
    // This would query other nodes to find the leader
    // For now, return null
    return Promise.resolve(null);
  }

  /**
   * Forward request to leader
   * @param leader - The leader node to forward to
   * @param method - The method name to call on the leader
   * @param _args - Arguments to pass (unused in simulation)
   * @returns Promise resolving to the leader's response
   */
  private forwardToLeader(leader: RaftNode, method: string, ..._args: unknown[]): Promise<unknown> {
    // This would make an RPC call to the leader
    logger.debug(`Forwarding ${method} to leader ${leader.id}`);
    return Promise.resolve(null);
  }

  /**
   * Apply committed entries to state machine
   * @returns Promise that resolves when all committed entries are applied
   */
  applyCommittedEntries(): Promise<void> {
    while (this.lastApplied < this.commitIndex) {
      this.lastApplied++;
      const _entry = this.log[this.lastApplied];
      
      if (_entry !== undefined) {
        this.emit('apply', _entry.command);
      }
    }
    return Promise.resolve();
  }

  /**
   * Get consensus status
   * @returns Current consensus status information
   */
  getStatus(): ConsensusStatus {
    return {
      nodeId: this.config.nodeId,
      state: this.state,
      term: this.currentTerm,
      votedFor: this.votedFor,
      logLength: this.log.length,
      commitIndex: this.commitIndex,
      lastApplied: this.lastApplied
    };
  }

  /**
   * Shutdown consensus
   */
  shutdown(): void {
    if (this.electionTimer !== undefined) {
      clearTimeout(this.electionTimer);
    }
    
    if (this.heartbeatTimer !== undefined) {
      clearTimeout(this.heartbeatTimer);
    }
    
    logger.info(`Raft consensus shutdown for node ${this.config.nodeId}`);
  }
}