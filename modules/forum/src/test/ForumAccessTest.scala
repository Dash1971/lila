package lila.forum

import chess.PlayerTitle

import lila.core.user.{ Count, KidMode, Plan, UserEnabled }
import lila.core.team.{ Access, TeamApi }

class ForumAccessTest extends munit.FunSuite:
  given Executor = scala.concurrent.ExecutionContext.global

  private val fresh = User(
    id = UserId("newposter"),
    username = UserName("NewPoster"),
    count = Count(0, 0, 0, 0, 0),
    enabled = UserEnabled(true),
    roles = Nil,
    playTime = None,
    createdAt = nowInstant,
    seenAt = None,
    kid = KidMode(false),
    lang = None,
    plan = Plan(0, false, false, None)
  )
  private val category = ForumCategId("mute-feedback")

  // Global categories do not call the team/relation APIs.
  private def access(immediate: Boolean) = new ForumAccess(null, null, immediate)
  private def canWrite(user: Option[User], immediate: Boolean) =
    access(immediate).isGrantedWrite(category)(using user.map(Me(_)))

  test("Mute Chess permits a fresh human with no games to post"):
    canWrite(Some(fresh), true).map(assertEquals(_, true))

  test("anonymous users and bots remain unable to post"):
    for
      anonymous <- canWrite(None, true)
      bot <- canWrite(Some(fresh.copy(title = Some(PlayerTitle.BOT))), true)
    yield
      assertEquals(anonymous, false)
      assertEquals(bot, false)

  test("upstream mode still requires both account age and a completed game"):
    val played = fresh.copy(count = Count(0, 1, 0, 0, 1))
    val old = fresh.copy(createdAt = nowInstant.minusDays(3))
    for
      newAccount <- canWrite(Some(fresh), false)
      onlyGame <- canWrite(Some(played), false)
      onlyAge <- canWrite(Some(old), false)
      eligible <- canWrite(Some(played.copy(createdAt = old.createdAt)), false)
    yield
      assertEquals(newAccount, false)
      assertEquals(onlyGame, false)
      assertEquals(onlyAge, false)
      assertEquals(eligible, true)

  test("upstream title and patron exemptions remain available"):
    for
      titled <- canWrite(Some(fresh.copy(title = Some(PlayerTitle.GM))), false)
      patron <- canWrite(Some(fresh.copy(plan = Plan(1, true, false, None))), false)
    yield
      assertEquals(titled, true)
      assertEquals(patron, true)

  private class TeamFixture(mode: Access, member: Boolean, leader: Boolean) extends TeamApi:
    def forumAccessOf(id: TeamId) = fuccess(mode)
    def isMember(id: TeamId)(using lila.core.userId.MyId) = fuccess(member)
    def isLeader(id: TeamId)(using lila.core.userId.MyId) = fuccess(leader)
    def filterHideForum(ids: Iterable[TeamId]) = throw new UnsupportedOperationException
    def leaderIds(id: TeamId) = throw new UnsupportedOperationException
    def creatorOf(id: TeamId) = throw new UnsupportedOperationException
    def filterUserIdsInTeam(id: TeamId, users: Iterable[UserId]) = throw new UnsupportedOperationException
    def hasCommPerm(id: TeamId)(using lila.core.userId.MyId) = throw new UnsupportedOperationException
    def cursor = throw new UnsupportedOperationException

  test("immediate posting preserves disabled, member and leader team permissions"):
    given Option[Me] = Some(Me(fresh))
    val teamCategory = ForumCateg.fromTeamId(TeamId("private-team"))
    def allowed(mode: Access, member: Boolean = false, leader: Boolean = false) =
      new ForumAccess(new TeamFixture(mode, member, leader), null, true).isGrantedWrite(teamCategory)
    for
      disabled <- allowed(Access.None, member = true, leader = true)
      outsider <- allowed(Access.Everyone)
      member <- allowed(Access.Members, member = true)
      notLeader <- allowed(Access.Leaders, member = true)
      leader <- allowed(Access.Leaders, member = true, leader = true)
    yield
      assertEquals(disabled, false)
      assertEquals(outsider, false)
      assertEquals(member, true)
      assertEquals(notLeader, false)
      assertEquals(leader, true)
