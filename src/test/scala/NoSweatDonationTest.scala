package lila.app

import lila.db.dsl.{ *, given }

class NoSweatDonationTest extends munit.FunSuite:
  test("dismissal atomically binds the exact invoice and authenticated account to unpaid state"):
    val payment = "a" * 64
    val selector = NoSweatDonation.dismissSelector(UserId("donor"), payment)
    assertEquals(selector.getAsOpt[String]("_id"), Some(payment))
    assertEquals(selector.getAsOpt[UserId]("userId"), Some(UserId("donor")))
    assertEquals(selector.getAsOpt[Boolean]("paid"), Some(false))
    assertEquals(selector.elements.map(_.name).toSet, Set("_id", "userId", "paid"))
    assertNotEquals(selector, NoSweatDonation.dismissSelector(UserId("another"), payment))
    assertNotEquals(selector, NoSweatDonation.dismissSelector(UserId("donor"), "b" * 64))
