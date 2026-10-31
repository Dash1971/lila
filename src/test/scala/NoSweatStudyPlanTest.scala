package lila.app

class NoSweatStudyPlanTest extends munit.FunSuite:
  test("the original pilot ramp and one-worker plan remain unchanged"):
    val plan = NoSweatStudyPlan.find("pilot-10-v1").get
    assertEquals(plan.workers, 1)
    assertEquals(plan.maximumAdmitted, 100)
    assertEquals(plan.maximumConcurrency, 10)
    assertEquals(List(0, 4, 5, 9, 10, 19, 20, 100).map(plan.capacity), List(1, 1, 2, 2, 5, 5, 10, 10))

  test("the expanded trial has explicit steps, two workers and a hard 22-game ceiling"):
    val plan = NoSweatStudyPlan.find("ramp-22-v1").get
    assertEquals(plan.workers, 2)
    assertEquals(plan.maximumAdmitted, 100)
    assertEquals(plan.maximumConcurrency, 22)
    assertEquals(List(0, 9, 10, 24, 25, 39, 40, 100).map(plan.capacity), List(10, 10, 15, 15, 20, 20, 22, 22))
    assertEquals(NoSweatStudyPlan.find("unbounded"), None)
    intercept[IllegalArgumentException](plan.capacity(-1))

  test("the calibration batch permits exactly the reviewed 200-admission budget"):
    val plan = NoSweatStudyPlan.find("calibration-200-v1").get
    assertEquals(plan.maximumAdmitted, 200)
    assertEquals(plan.maximumConcurrency, 22)
    assertEquals(plan.workers, 2)
    assertEquals(List(0, 1, 99, 100, 199, 200).map(plan.capacity), List.fill(6)(22))

  test("the dated validation continuation retains one aggregate 3000-game budget"):
    val plan = NoSweatStudyPlan.find("strength-validation-continuation-v1").get
    assertEquals(plan.maximumAdmitted, 3000)
    assertEquals(plan.maximumConcurrency, 22)
    assertEquals(plan.workers, 2)
    assertEquals(List(0, 2000, 2999, 3000).map(plan.capacity), List.fill(4)(22))

  test("the new rating establishment has a separate 3000-game budget and fixed resource plan"):
    val plan = NoSweatStudyPlan.find("rating-establishment-v1").get
    assertEquals(plan.maximumAdmitted, 3000)
    assertEquals(plan.maximumConcurrency, 22)
    assertEquals(plan.workers, 2)
    assertEquals(List(0, 2000, 2999, 3000).map(plan.capacity), List.fill(4)(22))
    val start = NoSweatStudyPlan.establishmentStart
    assert(plan.establishmentAdmission(start, start, 0))
    assert(plan.establishmentAdmission(start, start, 2999))
    assert(!plan.establishmentAdmission(start, start, 3000))
    assert(!plan.establishmentAdmission(start, start, -1))

  test("the overnight scope cannot reopen old public runs or use another private fixture"):
    val plan = NoSweatStudyPlan.find("rating-establishment-v1").get
    val start = NoSweatStudyPlan.establishmentStart
    assert(plan.establishmentScope("r20261031n163", true, start))
    assert(plan.establishmentScope("q20261031n163", false, start))
    assert(!plan.establishmentScope("r20261031p137", true, start))
    assert(!plan.establishmentScope("r20261031n163", false, start))
    assert(!plan.establishmentScope("q20261031n163", true, start))
    assert(!plan.establishmentScope("q20261031p137", false, start))

  test("overnight preparation consumes the fixed eight-hour window without extending deadlines"):
    val plan = NoSweatStudyPlan.find("rating-establishment-v1").get
    val start = NoSweatStudyPlan.establishmentStart
    val admissions = NoSweatStudyPlan.establishmentAdmissionEnd
    val deadline = NoSweatStudyPlan.establishmentDeadline
    assertEquals(deadline - start, 8L * 60 * 60000)
    assertEquals(deadline - admissions, 30L * 60000)
    assert(!plan.establishmentScope("r20261031n163", true, start - 1))
    assert(!plan.establishmentScope("r20261031n163", true, admissions))
    assert(plan.establishmentScope("r20261031n163", true, start + 60 * 60000))
    assert(!plan.establishmentAdmission(start - 1, start, 0))
    assert(plan.establishmentAdmission(admissions - 1, start, 2999))
    assert(!plan.establishmentAdmission(admissions, start, 0))
    assert(!plan.establishmentAdmission(deadline, start, 0))

  test("earlier profiles cannot use the overnight scope or its admission hook"):
    for key <- List(
        "pilot-10-v1",
        "ramp-22-v1",
        "calibration-200-v1",
        "strength-predictor-v1",
        "strength-validation-continuation-v1"
      )
    do
      val plan = NoSweatStudyPlan.find(key).get
      assert(!plan.ratingEstablishment)
      assert(!plan.establishmentScope("r20261031n163", true, NoSweatStudyPlan.establishmentStart))
      assert(
        !plan.establishmentAdmission(
          NoSweatStudyPlan.establishmentStart,
          NoSweatStudyPlan.establishmentStart,
          0
        )
      )
