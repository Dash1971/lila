package lila.security

import lila.core.perm.Permission
import lila.core.user.{ Count, KidMode, Me, Plan, RoleDbKey, TotpSecret, User, UserEnabled }
import lila.oauth.{ OAuthScope, TokenScopes }

class ModeratorOAuthTest extends munit.FunSuite:

  private val roles = List(Permission.ViewPrivateComms.dbKey, Permission.Verified.dbKey)

  private def filter(
      mode: play.api.Mode,
      totp: Boolean,
      webMod: Boolean = true,
      accountRoles: List[RoleDbKey] = roles
  ) =
    val user = User(
      id = UserId("oauthfixture"),
      username = UserName("OAuthFixture"),
      count = Count(0, 0, 0, 0, 0),
      enabled = UserEnabled(true),
      roles = accountRoles,
      playTime = None,
      createdAt = java.time.Instant.EPOCH,
      seenAt = None,
      kid = KidMode(false),
      lang = None,
      plan = Plan(0, false, false, None),
      totpSecret = Option.when(totp)(TotpSecret(Array.fill(20)(0.toByte)))
    )
    val scoped = OAuthScope.Scoped(Me(user), TokenScopes(if webMod then List(OAuthScope.Web.Mod) else Nil))
    // Exercise the production filter without changing its private visibility or using any external services.
    val api = new SecurityApi(null, null, null, null, null, null, null, null, null)(using
      scala.concurrent.ExecutionContextOpportunistic,
      mode
    )
    val method = classOf[SecurityApi].getDeclaredMethods.find(_.getName == "stripRolesOfOAuthUser").get
    method.setAccessible(true)
    method.invoke(api, scoped).asInstanceOf[OAuthScope.Scoped]

  test("production web:mod token loses moderator roles without enrolled TOTP"):
    val result = filter(play.api.Mode.Prod, false)
    assert(!result.me.roles.contains(Permission.ViewPrivateComms.dbKey))
    assert(result.me.roles.contains(Permission.Verified.dbKey))

  test("the same existing token follows the current account enrollment state"):
    assert(filter(play.api.Mode.Prod, true).me.roles.contains(Permission.ViewPrivateComms.dbKey))
    assert(!filter(play.api.Mode.Prod, false).me.roles.contains(Permission.ViewPrivateComms.dbKey))

  test("production enrolled moderator retains roles with web:mod"):
    assertEquals(filter(play.api.Mode.Prod, true).me.roles, roles)

  test("a token without web:mod still loses moderator roles even with TOTP"):
    assert(
      !filter(play.api.Mode.Prod, true, webMod = false).me.roles.contains(Permission.ViewPrivateComms.dbKey)
    )

  test("development and test keep upstream web:mod behavior"):
    for mode <- List(play.api.Mode.Dev, play.api.Mode.Test) do
      assertEquals(filter(mode, false).me.roles, roles)

  test("ordinary accounts gain no moderator permissions"):
    assertEquals(filter(play.api.Mode.Prod, true, accountRoles = Nil).me.roles, Nil)
