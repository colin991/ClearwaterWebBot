import { fetchPcsoAssignedMelonlyCalls } from '../../utils/melonly.js';

/** Pinellas County Sheriff's Office Melonly department id. */
const PINELLAS_MELONLY_DEPARTMENT_ID = '7470323914464301056';

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.statusCode = 405;
    return response.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=15');

  const apiKey = process.env.MELONLY_API_KEY?.trim();
  if (!apiKey) {
    response.statusCode = 503;
    return response.end(JSON.stringify({
      calls: [],
      configured: false,
      error: 'Melonly is not configured.',
      message: 'Active calls are unavailable because Melonly is not configured.',
    }));
  }

  try {
    const result = await fetchPcsoAssignedMelonlyCalls(apiKey, {
      pinellasDepartmentId: PINELLAS_MELONLY_DEPARTMENT_ID,
    });
    return response.end(JSON.stringify({
      configured: true,
      updatedAt: new Date().toISOString(),
      calls: result.calls,
      message: result.calls.length
        ? undefined
        : 'No active Melonly calls currently have a PCSO unit assigned.',
    }));
  } catch (error) {
    const status = error?.status === 429 ? 429 : 502;
    response.statusCode = status;
    return response.end(JSON.stringify({
      configured: true,
      calls: [],
      error: error?.message || 'Melonly CAD calls could not be loaded.',
      message: 'Active calls could not be loaded from Melonly right now.',
    }));
  }
}
