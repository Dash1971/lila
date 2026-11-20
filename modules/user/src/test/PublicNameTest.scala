package lila.user

class PublicNameTest extends munit.FunSuite:
  def bind(name: String, previous: Option[String] = None) =
    UserForm.publicName(previous).withPrefix("name").bind(Map("name" -> name))

  test("new public names are optional and limited to twenty characters"):
    assertEquals(bind(""), Right(None))
    assertEquals(bind("a" * 20), Right(Some("a" * 20)))
    assert(bind("a" * 21).isLeft)

  test("new public names cannot take system IDs, including normalized spellings"):
    val reserved = "n" + "a" * 19
    assert(bind(reserved).isLeft)
    assert(bind("Ｎ" + "Ａ" * 19).isLeft)
    assertEquals(bind(reserved, Some(reserved)), Right(Some(reserved)))
    assertEquals(bind("棋士さくら"), Right(Some("棋士さくら")))

  test("existing longer names survive unrelated profile edits without allowing new long names"):
    val old = "PreviouslyChosenLongPublicName"
    assertEquals(bind(old, Some(old)), Right(Some(old)))
    assert(bind("a" * 21, Some(old)).isLeft)
    assertEquals(bind("Short name", Some(old)), Right(Some("Short name")))
