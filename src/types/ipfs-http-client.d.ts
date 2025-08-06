/**
 * Type definitions for ipfs-http-client
 * Since @types/ipfs-http-client doesn't exist, we create minimal types
 */

declare module 'ipfs-http-client' {
  export interface IPFSHTTPClient {
    add(content: string | Buffer | Uint8Array, options?: IPFSAddOptions): Promise<{ cid: IPFSCID; size: number }>;
    get(cid: string): AsyncIterable<IPFSFileObject>;
    version(): Promise<{ version: string }>;
    pin: {
      add(cid: string): Promise<void>;
      rm(cid: string): Promise<void>;
    };
    swarm: {
      peers(): Promise<IPFSPeer[]>;
    };
    repo: {
      stat(): Promise<{ repoSize: number }>;
    };
    id(): Promise<{ id: string }>;
  }

  export interface IPFSCID {
    toString(): string;
  }

  export interface IPFSAddOptions {
    pin?: boolean;
    onlyHash?: boolean;
    cidVersion?: 0 | 1;
  }

  export interface IPFSFileObject {
    path: string;
    content?: Uint8Array;
  }

  export interface IPFSPeer {
    peer: string;
    addr: string;
    latency?: string;
  }

  export interface IPFSOptions {
    host?: string;
    port?: number;
    protocol?: string;
    timeout?: number;
  }

  export function create(options?: IPFSOptions): IPFSHTTPClient;
}