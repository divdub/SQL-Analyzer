export default function handler(req, res) {
  res.status(200).json({ status: "Server is running", timestamp: new Date() });
}
