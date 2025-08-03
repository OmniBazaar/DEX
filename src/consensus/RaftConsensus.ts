/**
 * Raft Consensus for DEX Order Book Synchronization
 * 
 * Implements Raft consensus algorithm for distributed order book state
 * across multiple validator nodes to ensure consistency.
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export enum NodeState {
  FOLLOWER = 'FOLLOWER',
  CANDIDATE = 'CANDIDATE',
  LEADER = 'LEADER'
}

export interface RaftNode {
  id: string;
  address: string;
  port: number;
}

export interface LogEntry {
  term: number;
  index: number;
  command: any;
  timestamp: number;
}

export interface RaftConfig {
  nodeId: string;
  nodes: RaftNode[];
  electionTimeout: number; // milliseconds
  heartbeatInterval: number; // milliseconds
}

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
  private electionTimer?: NodeJS.Timeout;
  private heartbeatTimer?: NodeJS.Timeout;
  
  constructor(config: RaftConfig) {
    super();
    this.config = config;
    this.resetElectionTimer();
  }

  /**
   * Get current leader state
   */
  async getLeaderState(): Promise<any> {
    if (this.state !== NodeState.LEADER) {
      // Forward to leader
      const leader = await this.findLeader();
      if (leader) {
        return this.forwardToLeader(leader, 'getState');
      }
      throw new Error('No leader available');
    }
    
    // Return current committed state
    return {
      term: this.currentTerm,
      commitIndex: this.commitIndex,
      events: this.log.slice(0, this.commitIndex + 1)
    };
  }

  /**
   * Propose a new command (only leader can accept)
   */
  async proposeCommand(command: any): Promise<boolean> {
    if (this.state !== NodeState.LEADER) {
      const leader = await this.findLeader();
      if (leader) {
        return this.forwardToLeader(leader, 'propose', command);
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
    if (this.electionTimer) {
      clearTimeout(this.electionTimer);
    }
    
    // Randomize timeout to prevent split votes
    const timeout = this.config.electionTimeout + 
      Math.floor(Math.random() * this.config.electionTimeout);
    
    this.electionTimer = setTimeout(() => {
      this.startElection();
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
   */
  private async requestVote(node: RaftNode): Promise<boolean> {
    // This would make an RPC call to the other node
    // For now, simulate with random response
    const granted = Math.random() > 0.3;
    
    logger.debug(`Vote request to ${node.id}: ${granted ? 'granted' : 'denied'}`);
    
    return granted;
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
    if (this.electionTimer) {
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
    
    if (this.heartbeatTimer) {
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
        this.sendAppendEntries(node);
      }
    }
    
    // Schedule next heartbeat
    this.heartbeatTimer = setTimeout(() => {
      this.sendHeartbeat();
    }, this.config.heartbeatInterval);
  }

  /**
   * Send AppendEntries RPC
   */
  private async sendAppendEntries(node: RaftNode): Promise<void> {
    const nextIdx = this.nextIndex.get(node.id) || 0;
    const prevLogIndex = nextIdx - 1;
    const prevLogTerm = prevLogIndex >= 0 ? this.log[prevLogIndex].term : 0;
    
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
   */
  private async appendEntriesToNode(node: RaftNode, data: any): Promise<boolean> {
    // This would make an actual RPC call
    // For now, simulate success
    return Math.random() > 0.1;
  }

  /**
   * Replicate entry to majority of nodes
   */
  private async replicateEntry(entry: LogEntry): Promise<boolean> {
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
   */
  private async findLeader(): Promise<RaftNode | null> {
    // This would query other nodes to find the leader
    // For now, return null
    return null;
  }

  /**
   * Forward request to leader
   */
  private async forwardToLeader(leader: RaftNode, method: string, ...args: any[]): Promise<any> {
    // This would make an RPC call to the leader
    logger.debug(`Forwarding ${method} to leader ${leader.id}`);
    return null;
  }

  /**
   * Apply committed entries to state machine
   */
  async applyCommittedEntries(): Promise<void> {
    while (this.lastApplied < this.commitIndex) {
      this.lastApplied++;
      const entry = this.log[this.lastApplied];
      
      if (entry) {
        this.emit('apply', entry.command);
      }
    }
  }

  /**
   * Get consensus status
   */
  getStatus(): any {
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
    if (this.electionTimer) {
      clearTimeout(this.electionTimer);
    }
    
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
    }
    
    logger.info(`Raft consensus shutdown for node ${this.config.nodeId}`);
  }
}