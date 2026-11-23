package lila.chat

import scala.collection.mutable.ListBuffer

import lila.common.Bus
import lila.core.config.NetDomain
import lila.core.perm.Permission
import lila.core.security.DeletePublicChats
import lila.core.user.{ Count, KidMode, Me, Plan, RoleDbKey, User, UserEnabled }

class NoSweatChatTimeoutTest extends munit.FunSuite:
  private val target = UserId("timeoutregressiontarget")
  private val deletions = ListBuffer.empty[DeletePublicChats]
  private val audits = ListBuffer.empty[lila.core.mod.ChatTimeout]

  Bus.sub[DeletePublicChats]: event =>
    if event.userId == target then deletions += event
  Bus.sub[lila.core.mod.ChatTimeout]: event =>
    if event.user == target then audits += event

  private def user(id: UserId, roles: List[RoleDbKey]) = User(
    id = id,
    username = UserName(id.value),
    count = Count(0, 0, 0, 0, 0),
    enabled = UserEnabled(true),
    roles = roles,
    playTime = None,
    createdAt = java.time.Instant.EPOCH,
    seenAt = None,
    kid = KidMode(false),
    lang = None,
    plan = Plan(0, false, false, None),
    totpSecret = None
  )

  private def publish(roles: List[RoleDbKey], isNew: Boolean): Unit =
    deletions.clear()
    audits.clear()
    val api =
      new ChatApi(null, null, null, null, null, null, null, null, null, NetDomain("mutechess.org"))(using
        scala.concurrent.ExecutionContextOpportunistic,
        null
      )
    // Exercise actual production event publication; no database or visibility change is needed.
    val method = api.userChat.getClass.getDeclaredMethods.find(_.getName == "publishModerationTimeout").get
    method.setAccessible(true)
    method.invoke(
      api.userChat,
      user(target, Nil),
      ChatTimeout.Reason.Other,
      "local timeout regression",
      Boolean.box(isNew),
      Me(user(UserId("timeoutregressionowner"), roles))
    )

  for isNew <- List(true, false) do
    test(s"ordinary room owner cannot publish cross-chat deletion or moderator audit: new=$isNew"):
      publish(Nil, isNew)
      assertEquals(deletions.toList, Nil)
      assertEquals(audits.toList, Nil)

  for permission <- List(Permission.ChatTimeout, Permission.BroadcastTimeout) do
    test(s"${permission.dbKey} retains deletion and audit for a new timeout"):
      publish(List(permission.dbKey), true)
      assertEquals(deletions.toList, List(DeletePublicChats(target)))
      assertEquals(audits.map(_.user).toList, List(target))
      assertEquals(audits.map(_.text).toList, List("local timeout regression"))

    test(s"${permission.dbKey} retains audit without repeated deletion for an existing timeout"):
      publish(List(permission.dbKey), false)
      assertEquals(deletions.toList, Nil)
      assertEquals(audits.map(_.user).toList, List(target))

  test("an unrelated account role does not grant cross-chat moderation"):
    publish(List(Permission.Verified.dbKey), true)
    assertEquals(deletions.toList, Nil)
    assertEquals(audits.toList, Nil)
