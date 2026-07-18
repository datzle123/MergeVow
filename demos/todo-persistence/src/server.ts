import { createServer } from "node:http";
import type { AddressInfo, Socket } from "node:net";

export const TODO_DEMO_VARIANTS = ["baseline", "semantic-refactor", "broken-persistence"] as const;

export type TodoDemoVariant = (typeof TODO_DEMO_VARIANTS)[number];

export interface TodoDemoServer {
  readonly close: () => Promise<void>;
  readonly origin: string;
  readonly requests: readonly string[];
  readonly variant: TodoDemoVariant;
}

function baselineMarkup(): string {
  return `
    <main class="todo-shell">
      <h1>Todo list</h1>
      <button id="add-task">Add task</button>
      <section id="editor" hidden>
        <label for="title">Title</label>
        <input id="title">
        <button id="create-task">Create</button>
      </section>
      <ul id="tasks" aria-label="Tasks"></ul>
    </main>`;
}

function refactoredMarkup(): string {
  return `
    <div data-layout="workspace">
      <header><h1>Tasks</h1></header>
      <div data-toolbar>
        <button id="add-task" aria-label="Add task"><span aria-hidden="true">+</span></button>
      </div>
      <aside id="editor" hidden>
        <div data-field><label>Title <input id="title"></label></div>
        <button id="create-task" aria-label="Create"><span aria-hidden="true">Save</span></button>
      </aside>
      <ol id="tasks" aria-label="Tasks"></ol>
    </div>`;
}

function appScript(persistent: boolean): string {
  return `<script>
    (() => {
      const persistent = ${JSON.stringify(persistent)};
      const storageKey = "mergevow.todo-persistence";
      const addTask = document.getElementById("add-task");
      const createTask = document.getElementById("create-task");
      const editor = document.getElementById("editor");
      const title = document.getElementById("title");
      const taskList = document.getElementById("tasks");
      let tasks = [];
      if (persistent) {
        try {
          const stored = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
          tasks = Array.isArray(stored) && stored.every((value) => typeof value === "string")
            ? stored
            : [];
        } catch {
          tasks = [];
        }
      }

      const render = () => {
        taskList.replaceChildren();
        for (const task of tasks) {
          const item = document.createElement("li");
          item.setAttribute("aria-label", task);
          item.textContent = task;
          taskList.append(item);
        }
      };

      addTask.addEventListener("click", () => {
        editor.hidden = false;
        title.focus();
      });
      createTask.addEventListener("click", () => {
        const value = title.value.trim();
        if (value === "") {
          return;
        }
        tasks = [...tasks, value];
        if (persistent) {
          localStorage.setItem(storageKey, JSON.stringify(tasks));
        }
        render();
        title.value = "";
        editor.hidden = true;
      });
      render();
    })();
  </script>`;
}

function todoDocument(variant: TodoDemoVariant): string {
  const persistent = variant !== "broken-persistence";
  const markup = variant === "baseline" ? baselineMarkup() : refactoredMarkup();
  return `<!doctype html>
    <html lang="en">
      <head><meta charset="utf-8"><title>MergeVow Todo Persistence</title></head>
      <body>${markup}${appScript(persistent)}</body>
    </html>`;
}

export async function startTodoDemo(variant: TodoDemoVariant): Promise<TodoDemoServer> {
  const requests: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((request, response) => {
    const path = request.url ?? "/";
    requests.push(path);
    response.setHeader("connection", "close");
    if (path !== "/todos") {
      response.statusCode = 404;
      response.end("not found");
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(todoDocument(variant));
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
        for (const socket of sockets) {
          socket.destroy();
        }
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
      return closePromise;
    },
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    variant,
  });
}
