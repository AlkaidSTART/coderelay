import index from "../src/index.html";

const port = 1420;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  routes: {
    "/": index,
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log(`CodeRelay desktop frontend: ${server.url}`);
