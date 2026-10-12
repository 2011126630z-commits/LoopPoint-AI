export default function handler(_req, res) {
  res.status(200).json({
    ok: true,
    configured: Boolean(process.env.DEEPSEEK_API_KEY),
  })
}
