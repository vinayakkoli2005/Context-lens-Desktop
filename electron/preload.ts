import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from './ipc-channels';

contextBridge.exposeInMainWorld('cc', {
  // generic invokers
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
  on: (channel: string, listener: (...args: any[]) => void) => {
    const wrapped = (_e: unknown, ...args: any[]) => listener(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
  channels: IPC
});

declare global {
  interface Window {
    cc: {
      invoke: (channel: string, ...args: any[]) => Promise<any>;
      send: (channel: string, ...args: any[]) => void;
      on: (channel: string, listener: (...args: any[]) => void) => () => void;
      channels: typeof IPC;
    };
  }
}
