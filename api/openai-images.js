export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Read raw multipart body and forward it unchanged to OpenAI
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OpenAi}`,
      'Content-Type': req.headers['content-type'],
    },
    body,
  });

  const data = await response.json();
  res.status(response.status).json(data);
}
