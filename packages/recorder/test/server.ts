import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";

export interface RecorderTestServer {
  readonly close: () => Promise<void>;
  readonly origin: string;
  readonly requests: string[];
}

export async function startRecorderTestServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<RecorderTestServer> {
  const requests: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((request, response) => {
    requests.push(request.url ?? "/");
    response.setHeader("connection", "close");
    handler(request, response);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  let closePromise: Promise<void> | undefined;
  return Object.freeze({
    close: () => {
      closePromise ??= new Promise<void>((resolve, reject) => {
        for (const socket of sockets) socket.destroy();
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
      return closePromise;
    },
    origin: `http://127.0.0.1:${address.port}`,
    requests,
  });
}
