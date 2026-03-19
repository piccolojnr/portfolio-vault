export async function GET() {
  return new Response(
    JSON.stringify({
      status: "ok",
      timestamp: new Date().toISOString(),
      runtime: process.env.VERCEL
        ? "vercel"
        : process.env.NODE_ENV === "production"
          ? "production"
          : "development",
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
