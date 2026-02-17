module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const passcode = req.headers["x-admin-passcode"];
  const expected = process.env.ADMIN_PASSCODE;

  if (!expected) {
    res.status(500).json({ error: "ADMIN_PASSCODE is not configured." });
    return;
  }

  if (passcode !== expected) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  res.status(200).json({ ok: true });
};
