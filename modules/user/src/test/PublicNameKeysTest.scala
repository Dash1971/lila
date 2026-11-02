package lila.user

class PublicNameKeysTest extends munit.FunSuite:
  test("case-insensitive keys retain the canonical reservation"):
    assertEquals(PublicNameKeys("AccountOne", Some("Chosen Name")), List("accountone", "chosen name"))
    assertEquals(PublicNameKeys.normalize("I"), "i")
    assertEquals(PublicNameKeys.normalize("İ"), "i\u0307")

  test("NFKC compatibility normalization and trimming precede case conversion"):
    assertEquals(PublicNameKeys.normalize("  ＡＬＩＣＥ  "), "alice")
    assertEquals(PublicNameKeys.normalize("\u00a0Kelvin\u00a0"), "kelvin")
    assertEquals(PublicNameKeys.normalize("E\u0301lodie"), "élodie")

  test("absent and normalized blank display names add no reservation"):
    assertEquals(PublicNameKeys("account", None), List("account"))
    assertEquals(PublicNameKeys("account", Some(" \t ")), List("account"))
    assertEquals(PublicNameKeys("account", Some("\u00a0")), List("account"))

  test("a chosen name equal to the canonical key is stored only once"):
    assertEquals(PublicNameKeys("Alice", Some(" ＡＬＩＣＥ ")), List("alice"))

  test("renaming and clearing release the old chosen key while keeping the canonical key"):
    assertEquals(PublicNameKeys("account", Some("Old Name")), List("account", "old name"))
    assertEquals(PublicNameKeys("account", Some("New Name")), List("account", "new name"))
    assertEquals(PublicNameKeys("account", None), List("account"))

  test("bot display aliases reserve their full normalized spaced name"):
    assertEquals(
      PublicNameKeys("SignalTrain001", Some("Major Motoko")),
      List("signaltrain001", "major motoko")
    )
