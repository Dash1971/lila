package lila.user

import lila.db.dsl.{ *, given }

class NoSweatNostrIdentityTest extends munit.FunSuite:
  private val key = "2f2b537576f0256497f" + "0" * 45
  private val canonical = "n2f2b537576f0256497f"
  private val base = bdoc(
    "_id" -> canonical,
    "username" -> canonical,
    "nameKeys" -> List(canonical),
    "count" -> bdoc("game" -> 0)
  )

  test("chosen names never determine the permanent account ID"):
    List(None, Some("Test1"), Some("AnotherName")).foreach: chosen =>
      val doc = NoSweatNostrIdentity.mark(base, key, chosen)
      assertEquals(doc.getAsOpt[String]("_id"), Some(canonical))
      assertEquals(doc.getAsOpt[String]("username"), Some(canonical))
      assertEquals(doc.getAsOpt[String]("nostr"), Some(key))
      assertEquals(doc.child("profile").flatMap(_.getAsOpt[String]("displayName")), chosen)
      assertEquals(doc.getAsOpt[List[String]]("nameKeys"), Some(PublicNameKeys(canonical, chosen)))
      assertEquals(doc.elements.count(_.name == "nameKeys"), 1)
      assertEquals(doc.child("count").flatMap(_.getAsOpt[Int]("game")), Some(0))

  test("an unnamed signup retains the compact npub fallback and no empty profile"):
    val doc = NoSweatNostrIdentity.mark(base, key, None)
    assertEquals(doc.child("profile"), None)
    assert(lila.core.NostrName.display(canonical, None, Some(key)).isDefined)

  test("the native unique index receives both canonical and normalized chosen-name claims atomically"):
    val doc = NoSweatNostrIdentity.mark(base, key, Some("TeSt1"))
    assertEquals(doc.getAsOpt[List[String]]("nameKeys"), Some(List(canonical, "test1")))

  test("an invalid public key or name-derived base ID cannot be inserted"):
    intercept[IllegalArgumentException](NoSweatNostrIdentity.name("not-a-public-key"))
    intercept[IllegalArgumentException](
      NoSweatNostrIdentity.mark(bdoc("_id" -> "test1", "username" -> "Test1"), key, Some("Test1"))
    )
