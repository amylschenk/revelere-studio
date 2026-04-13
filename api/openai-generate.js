export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OpenAi}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(req.body),
  });
  const data = await response.json();
  res.status(response.status).json(data);
}
