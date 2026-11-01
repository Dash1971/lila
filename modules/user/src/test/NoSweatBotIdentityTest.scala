package lila.user

import lila.db.dsl.{ *, given }

class NoSweatBotIdentityTest extends munit.FunSuite:
  private val account = bdoc(
    "_id" -> "catalogone",
    "username" -> "CatalogOne",
    "noSweatBot" -> true,
    "count" -> bdoc("game" -> 0)
  )

  test("legacy managed bot creation retains exactly the previous insert document"):
    assertEquals(NoSweatBotIdentity.mark(account, None), account)
    assertEquals(NoSweatBotIdentity.mark(account, None).getAsOpt[String]("noSweatCatalogIdentity"), None)

  test("catalog creation inserts its ownership marker alongside the account without invented history"):
    val inserted = NoSweatBotIdentity.mark(account, Some("catalog-one"))
    assertEquals(inserted.getAsOpt[String]("noSweatCatalogIdentity"), Some("catalog-one"))
    assertEquals(inserted.getAsOpt[String]("_id"), Some("catalogone"))
    assertEquals(inserted.getAsOpt[String]("username"), Some("CatalogOne"))
    assertEquals(inserted.getAsOpt[Boolean]("noSweatBot"), Some(true))
    assertEquals(inserted.child("count").flatMap(_.getAsOpt[Int]("game")), Some(0))
    assertEquals(inserted.getAsOpt[String]("noSweatSeedVersion"), None)
