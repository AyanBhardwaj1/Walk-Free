// Keep this as an explicit import: Vercel's function tracer follows it and
// includes the Express application with the serverless API bundle.
import app from "../server/index";

export default app;
