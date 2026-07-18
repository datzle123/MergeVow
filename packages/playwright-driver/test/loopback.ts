import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";

export interface TestLoopbackServer {
  readonly close: () => Promise<void>;
  readonly origin: string;
  readonly port: number;
  readonly requests: string[];
}

export async function startTestLoopbackServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  port = 0,
): Promise<TestLoopbackServer> {
  const requests: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((request, response) => {
    requests.push(request.url ?? "/");
    try {
      handler(request, response);
    } catch (error) {
      response.destroy(error instanceof Error ? error : undefined);
    }
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => reject(error);
    server.once("error", onError);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  let closePromise: Promise<void> | undefined;
  return {
    close: () => {
      closePromise ??= new Promise<void>((resolve, reject) => {
        for (const socket of sockets) {
          socket.destroy();
        }
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
      return closePromise;
    },
    origin: `http://127.0.0.1:${address.port}`,
    port: address.port,
    requests,
  };
}
