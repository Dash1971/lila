package lila.core

/** Public-key display only. Canonical usernames and Nostr identity remain unchanged. */
object NostrName:
  private val alphabet = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
  private val generators = Array(0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3)

  def npub(key: String): Option[String] = Option.when(key.matches("[0-9a-f]{64}")):
    val words = scala.collection.mutable.ArrayBuffer.empty[Int]
    var acc = 0
    var bits = 0
    key
      .grouped(2)
      .foreach: hex =>
        acc = ((acc << 8) | Integer.parseInt(hex, 16)) & 0xffff
        bits += 8
        while bits >= 5 do
          bits -= 5
          words += ((acc >> bits) & 31)
    if bits > 0 then words += ((acc << (5 - bits)) & 31)
    val hrp = "npub"
    val expanded = hrp.map(_.toInt >> 5) ++ Seq(0) ++ hrp.map(_.toInt & 31)
    var checksum = 1
    (expanded ++ words ++ Seq.fill(6)(0)).foreach: value =>
      val top = checksum >>> 25
      checksum = ((checksum & 0x1ffffff) << 5) ^ value
      generators.indices.foreach: i =>
        if ((top >>> i) & 1) != 0 then checksum ^= generators(i)
    checksum ^= 1
    hrp + "1" + words.map(alphabet(_)).mkString +
      (0 until 6).map(i => alphabet((checksum >>> (5 * (5 - i))) & 31)).mkString

  def display(username: String, chosen: Option[String], key: Option[String]): Option[String] =
    chosen
      .filter(_.nonEmpty)
      .orElse:
        key
          .filter(k => username.equalsIgnoreCase("n" + k.take(19)))
          .flatMap(npub)
          .map: full =>
            full.take(9) + "…" + full.takeRight(4)
