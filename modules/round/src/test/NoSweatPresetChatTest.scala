package lila.round

import scala.concurrent.Future

class NoSweatPresetChatTest extends munit.FunSuite:
  import NoSweatPresetChat.*
  private given Executor = scala.concurrent.ExecutionContext.global
  private val human = UserId("human")
  private val bot = UserId("bot")
  private val signed = Session(Color.White, Some(human), bot)
  private val anon = Session(Color.Black, None, bot)

  test("signed participant only; bot and spectator cannot elicit replies"):
    assertEquals(replyFor(signed, Left(human), false, 0, "Hello"), Some("start" -> "hi"))
    for sender <- List(Left(bot), Left(UserId("spectator")), Right(Color.White)) do
      assertEquals(replyFor(signed, sender, false, 0, "Hello"), None)

  test("anonymous participant must have the admitted color and no registered identity"):
    assertEquals(replyFor(anon, Right(Color.Black), false, 0, "Good luck"), Some("start" -> "you too!"))
    for sender <- List(Right(Color.White), Left(human), Left(bot)) do
      assertEquals(replyFor(anon, sender, false, 0, "Hello"), None)

  test("native phase boundaries reject free text, commands and misplaced presets"):
    assertEquals(replyFor(signed, Left(human), false, 4, "Hello"), Some("start" -> "hi"))
    assertEquals(replyFor(signed, Left(human), false, 5, "Hello"), None)
    assertEquals(replyFor(signed, Left(human), false, 0, "Good game"), None)
    for text <- List("Hello there", "/whisper Hello", "rematch", "hi") do
      assertEquals(replyFor(signed, Left(human), false, 0, text), None)

  test("closing replies depend on finished game, never active tracking state or an engine"):
    assertEquals(replyFor(signed, Left(human), true, 80, "Good game"), Some("end" -> "ty, gg"))
    assertEquals(replyFor(anon, Right(Color.Black), true, 80, "Bye!"), Some("end" -> "bye!"))
    assertEquals(replyFor(signed, Left(human), true, 0, "Hello"), None)

  test("rejected native write never claims a reply or publishes one"):
    respond(
      () => Future.successful(false),
      () => fail("must not claim rejected, muted or flooded input"),
      () => fail("must not reply")
    )

  test("persistent duplicate/cap claim suppresses replies after accepted input"):
    respond(
      () => Future.successful(true),
      () => Future.successful(false),
      () => fail("must not reply to a duplicate or third message")
    )

  test("accepted input and fresh claim produce exactly one native reply"):
    var replies = 0
    respond(
      () => Future.successful(true),
      () => Future.successful(true),
      () => Future.successful { replies += 1 }
    ).map(_ => assertEquals(replies, 1))
