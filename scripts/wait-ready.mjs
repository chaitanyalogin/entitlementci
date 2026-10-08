const urls = [
  "http://127.0.0.1:4000/ready",
  "http://127.0.0.1:4100/health",
  "http://127.0.0.1:5173",
];
for (const url of urls) {
  let ready = false;
  for (let n = 0; n < 120; n++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* startup may still be in progress */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Service did not become ready: " + url);
}
console.log("Application services are ready");
