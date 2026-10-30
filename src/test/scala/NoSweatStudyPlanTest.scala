package lila.app

class NoSweatStudyPlanTest extends munit.FunSuite:
  test("the original pilot ramp and one-worker plan remain unchanged"):
    val plan = NoSweatStudyPlan.find("pilot-10-v1").get
    assertEquals(plan.workers, 1)
    assertEquals(plan.maximumConcurrency, 10)
    assertEquals(List(0, 4, 5, 9, 10, 19, 20, 100).map(plan.capacity), List(1, 1, 2, 2, 5, 5, 10, 10))

  test("the expanded trial has explicit steps, two workers and a hard 22-game ceiling"):
    val plan = NoSweatStudyPlan.find("ramp-22-v1").get
    assertEquals(plan.workers, 2)
    assertEquals(plan.maximumConcurrency, 22)
    assertEquals(List(0, 9, 10, 24, 25, 39, 40, 100).map(plan.capacity), List(10, 10, 15, 15, 20, 20, 22, 22))
    assertEquals(NoSweatStudyPlan.find("unbounded"), None)
    intercept[IllegalArgumentException](plan.capacity(-1))
