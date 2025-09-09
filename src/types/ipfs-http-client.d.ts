/**
 * Type definitions for ipfs-http-client
 * Since @types/ipfs-http-client doesn't exist, we create minimal types
 */

declare module 'ipfs-http-client' {
  /**
   * Main IPFS HTTP client interface for interacting with IPFS nodes
   */
  export interface IPFSHTTPClient {
    /**
     * Add content to IPFS
     * @param content - Content to add (string, Buffer, or Uint8Array)
     * @param options - Optional add options
     * @returns Promise resolving to CID and size
     */
    add(content: string | Buffer | Uint8Array, options?: IPFSAddOptions): Promise<{ 
      /** Content identifier */
      cid: IPFSCID; 
      /** Size in bytes */
      size: number 
    }>;
    
    /**
     * Get content from IPFS by CID
     * @param cid - Content identifier string
     * @returns Async iterable of file objects
     */
    get(cid: string): AsyncIterable<IPFSFileObject>;
    
    /**
     * Get IPFS node version information
     * @returns Promise resolving to version info
     */
    version(): Promise<{ 
      /** IPFS version string */
      version: string 
    }>;
    
    /**
     * Pin operations for content persistence
     */
    pin: {
      /**
       * Pin content by CID
       * @param cid - Content identifier to pin
       * @returns Promise resolving when pinned
       */
      add(cid: string): Promise<void>;
      
      /**
       * Unpin content by CID
       * @param cid - Content identifier to unpin
       * @returns Promise resolving when unpinned
       */
      rm(cid: string): Promise<void>;
    };
    
    /**
     * Swarm operations for peer management
     */
    swarm: {
      /**
       * List connected peers
       * @returns Promise resolving to array of peer info
       */
      peers(): Promise<IPFSPeer[]>;
    };
    
    /**
     * Repository operations
     */
    repo: {
      /**
       * Get repository statistics
       * @returns Promise resolving to repo stats
       */
      stat(): Promise<{ 
        /** Repository size in bytes */
        repoSize: number 
      }>;
    };
    
    /**
     * Get node identity information
     * @returns Promise resolving to node ID
     */
    id(): Promise<{ 
      /** Node ID string */
      id: string 
    }>;
  }

  /**
   * IPFS Content Identifier
   */
  export interface IPFSCID {
    /**
     * Convert CID to string representation
     * @returns String representation of CID
     */
    toString(): string;
  }

  /**
   * Options for adding content to IPFS
   */
  export interface IPFSAddOptions {
    /** Whether to pin the added content */
    pin?: boolean;
    /** Only compute hash without adding to IPFS */
    onlyHash?: boolean;
    /** CID version to use (0 or 1) */
    cidVersion?: 0 | 1;
  }

  /**
   * IPFS file object structure
   */
  export interface IPFSFileObject {
    /** File path */
    path: string;
    /** File content as Uint8Array */
    content?: Uint8Array;
  }

  /**
   * IPFS peer information
   */
  export interface IPFSPeer {
    /** Peer identifier */
    peer: string;
    /** Peer address */
    addr: string;
    /** Connection latency if available */
    latency?: string;
  }

  /**
   * IPFS HTTP client connection options
   */
  export interface IPFSOptions {
    /** IPFS node host */
    host?: string;
    /** IPFS API port */
    port?: number;
    /** Connection protocol (http/https) */
    protocol?: string;
    /** Request timeout in milliseconds */
    timeout?: number;
  }

  /**
   * Create IPFS HTTP client instance
   * @param options - Connection options
   * @returns IPFS HTTP client instance
   */
  export function create(options?: IPFSOptions): IPFSHTTPClient;
}