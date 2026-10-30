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
