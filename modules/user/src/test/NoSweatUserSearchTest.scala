package lila.user

class NoSweatUserSearchTest extends munit.FunSuite:
  test("public search accepts short names, spaces and Unicode but bounds the term"):
    assertEquals(NoSweatUserSearch.read("  Al  "), Some("Al"))
    assertEquals(NoSweatUserSearch.read("Alice Smith"), Some("Alice Smith"))
    assertEquals(NoSweatUserSearch.read("友だち"), Some("友だち"))
    assertEquals(NoSweatUserSearch.read("a"), None)
    assertEquals(NoSweatUserSearch.read("a" * 31), None)
    assertEquals(NoSweatUserSearch.read("Al\nBob"), None)

  test("search punctuation is literal rather than a regular expression"):
    val regex = NoSweatUserSearch.literalPrefix("Al.*").r
    assert(regex.findFirstIn("Al.* Smith").nonEmpty)
    assert(regex.findFirstIn("Alice Smith").isEmpty)

  test("public search accepts complete public npubs and NIP-21 URIs, not private or malformed keys"):
    val npub = "npub10elfcs4fr0l0r8af98jlmgdh9c8tcxjvz9qkw038js35mp4dma8qzvjptg"
    assertEquals(NoSweatUserSearch.read(npub), Some(npub))
    assertEquals(NoSweatUserSearch.read(s"nostr:$npub"), Some(s"nostr:$npub"))
    assertEquals(
      NoSweatUserSearch.read(npub.toUpperCase(java.util.Locale.ROOT)),
      Some(npub.toUpperCase(java.util.Locale.ROOT))
    )
    assertEquals(NoSweatUserSearch.read("nsec" + npub.drop(4)), None)
    assertEquals(NoSweatUserSearch.read("nsec1partial"), None)
    assertEquals(NoSweatUserSearch.read(" NOSTR:NSEC1partial"), None)
    assertEquals(NoSweatUserSearch.read(npub.dropRight(1) + "q"), None)
    assertEquals(NoSweatUserSearch.read("npub1" + "q" * 58), None)
