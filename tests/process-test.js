process.stdin.on("data", (data) => {
  console.log(`in: ${data.toString()}`);
});

async function main() {
  await new Promise((res, rej) => {
    setTimeout(() => {
      res();
    }, 4000);
  });

  process.stdin.removeAllListeners()
  process.stdin.destroy()
}

main();
