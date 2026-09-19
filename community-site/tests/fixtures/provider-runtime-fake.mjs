// All outbound requests in this test runtime terminate here. No network service exists.
export default {
  async fetch(request) {
    if (request.url !== 'https://api.typesafe.ai/v1/systemone')
      throw Error('A redirect was followed');
    const { scenario } = await request.json();
    if (scenario === 'redirect')
      return Response.redirect('https://redirect-trap.invalid/never-send-a-key', 307);
    if (scenario === 'json') return new Response('not json');
    if (scenario === 'http') return new Response('untrusted error text', { status: 429 });
    if (scenario === 'echo') return Response.json({ echo: request.headers.get('authorization') });
    return Response.json({
      model: 'jev-1.13.0',
      answers: {},
      usage: { input_tokens: 17, output_tokens: 0 },
    });
  },
};
