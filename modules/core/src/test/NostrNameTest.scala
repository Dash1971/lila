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
