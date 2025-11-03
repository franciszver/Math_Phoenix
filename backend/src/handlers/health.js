/**
 * Health check handler - Lambda-compatible
 * This structure allows easy migration to Lambda functions
 */
export async function healthHandler(event, context) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString()
    })
  };
}

// Express route wrapper for local development
export function healthExpressRoute(req, res) {
  const result = healthHandler({}, {});
  res.status(result.statusCode).json(JSON.parse(result.body));
}

