export async function onRequestPost(context) {
  const { request } = context;
  const body = await request.json();
  const { apiKey, voice, input, temperature, speed } = body;

  if (!apiKey) {
    return new Response('API Key is required', { status: 400 });
  }

  const response = await fetch('https://openrouter.ai/api/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://tts-studio.pages.dev', // Default placeholder
      'X-OpenRouter-Title': 'Animal Mind TTS Studio'
    },
    body: JSON.stringify({
      model: 'google/gemini-3.1-flash-tts-preview',
      input,
      voice: (voice || 'aoede').toLowerCase(),
      response_format: 'pcm',
      temperature: temperature !== undefined ? Number(temperature) : 1.0,
      speed: speed !== undefined ? Number(speed) : 1.0
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    return new Response(errorText, { status: response.status });
  }

  const audioBuffer = await response.arrayBuffer();
  return new Response(audioBuffer, {
    headers: {
      'Content-Type': 'audio/pcm',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}
