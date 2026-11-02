package lila.core

class NostrNameTest extends munit.FunSuite:
  test("NIP-19 encoding agrees with independent nostr-tools vectors"):
    assertEquals(
      NostrName.npub("00" * 32),
      Some("npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzqujme")
    )
    assertEquals(
      NostrName.npub("11" * 32),
      Some("npub1zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygse4sl3h")
    )
    assertEquals(
      NostrName.npub("ff" * 32),
      Some("npub1lllllllllllllllllllllllllllllllllllllllllllllllllllsq7lrjw")
    )

  test("asymmetric public key retains every bit and checksum"):
    assertEquals(
      NostrName.npub("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"),
      Some("npub1qy352euf40x77qfrg4ncn27dauqjx3t83x4ummcpydzk0zdtehhstefp92")
    )

  test("only generated Nostr handles receive the compact fallback"):
    val key = "11" * 32
    assertEquals(NostrName.display("n" + key.take(19), None, Some(key)), Some("npub1zyg3…sl3h"))
    assertEquals(NostrName.display("Dash", None, Some(key)), None)
    assertEquals(NostrName.display("n" + key.take(19), Some("My name"), Some(key)), Some("My name"))
    assertEquals(NostrName.display("n" + key.take(19), None, None), None)
    assertEquals(NostrName.npub("not-a-key"), None)

  private val officialVectors = List(
    "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d" ->
      "npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6",
    "7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e" ->
      "npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg"
  )

  test("NIP-19 official public-key vectors decode without changing the existing encoder"):
    officialVectors.foreach: (key, encoded) =>
      assertEquals(NostrName.pubkeyFromNpub(encoded), Some(key))
      assertEquals(NostrName.npub(key), Some(encoded))

  test("public identities accept nostr URIs and uniform Bech32 case"):
    officialVectors.foreach: (key, encoded) =>
      assertEquals(NostrName.pubkeyFromNpub(s"nostr:$encoded"), Some(key))
      assertEquals(NostrName.pubkeyFromNpub(encoded.toUpperCase(java.util.Locale.ROOT)), Some(key))
      assertEquals(
        NostrName.pubkeyFromNpub(s"NOSTR:${encoded.toUpperCase(java.util.Locale.ROOT)}"),
        Some(key)
      )
      assertEquals(NostrName.pubkeyFromNpub(s"  nostr:$encoded\n"), Some(key))
      assertEquals(NostrName.pubkeyFromNpub("N" + encoded.drop(1)), None)
      assertEquals(NostrName.pubkeyFromNpub("nostr:N" + encoded.drop(1)), None)

  test("all 256 public-key bits survive decoding including leading zeros and padding"):
    val keys = List("00" * 32, "11" * 32, "ff" * 32) ++
      (0 until 16).map: offset =>
        (0 until 32).map(i => f"${(i * 17 + offset) & 255}%02x").mkString
    keys.foreach: key =>
      assertEquals(NostrName.pubkeyFromNpub(NostrName.npub(key).get), Some(key))

  test("checksums and alphabet must be valid standard Bech32, never Bech32m"):
    val encoded = officialVectors.head._2
    List(
      encoded.dropRight(1) + "q",
      encoded.take(5) + "o" + encoded.drop(6),
      "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqhuv77m"
    ).foreach: invalid =>
      assertEquals(NostrName.pubkeyFromNpub(invalid), None)

  test("valid checksums cannot admit nonzero padding or the wrong payload length"):
    // Independently checksummed malformed payloads: 32 bytes with nonzero pad
    // bits, 31 bytes, and 33 bytes respectively.
    List(
      "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqplkg8xt",
      "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkxnxjx",
      "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqnenctv"
    ).foreach: invalid =>
      assertEquals(NostrName.pubkeyFromNpub(invalid), None)

  test("private keys, TLV profiles, notes, shortened keys and unrelated URLs are not public identities"):
    val encoded = officialVectors.head._2
    List(
      "",
      "npub1short",
      encoded.take(9) + "…" + encoded.takeRight(4),
      "nsec" + encoded.drop(4),
      "nostr:nsec" + encoded.drop(4),
      "nprofile" + encoded.drop(4),
      "note" + encoded.drop(4),
      officialVectors.head._1,
      s"https://example.com/$encoded",
      s"nostr:$encoded?foo=bar",
      s"nostr:nostr:$encoded",
      encoded.take(10) + " " + encoded.drop(10)
    ).foreach: invalid =>
      assertEquals(NostrName.pubkeyFromNpub(invalid), None)
