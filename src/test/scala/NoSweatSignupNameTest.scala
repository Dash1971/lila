package lila.app

import lila.core.i18n.Translate
import lila.i18n.Translator

class NoSweatSignupNameTest extends munit.FunSuite:
  test("signup rejects a chosen account ID and accepts an ordinary or omitted name"):
    given Translate = Translator.toDefault
    val id = "n0123456789abcdef012"
    for name <- List(id, id.toUpperCase(java.util.Locale.ROOT)) do
      val error = intercept[NoSweatError](NoSweatService.signupDisplayName(Some(name)))
      assertEquals(error.status, 409)
      assertEquals(error.code, Some("reserved_public_name"))
    assertEquals(NoSweatService.signupDisplayName(Some("ChessFan")), Some("ChessFan"))
    assertEquals(NoSweatService.signupDisplayName(None), None)
    assertEquals(NoSweatService.signupDisplayName(Some("")), None)
