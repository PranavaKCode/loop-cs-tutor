export type Step = {
  question: string;
  hint: string;
  answer: RegExp;
  feedback: string;
};
export type Exercise = {
  id: string;
  name: string;
  topic: string;
  intro: string;
  steps: Step[];
  reflection: string;
};
export type PracticeState = {
  exercise: Exercise;
  step: number;
  misses: number;
};

// authored exercises remain available when the shared ai quota is exhausted.
export const exercises: Exercise[] = [
  {
    id: "search",
    name: "Halving a search space",
    topic: "Algorithms",
    intro:
      "Imagine a sorted list with 16 possible positions. In this simplified search, each comparison leaves exactly half the positions to consider.",
    steps: [
      {
        question: "After one comparison, how many positions remain?",
        hint: "Split 16 possible positions into two equal groups, then keep one group.",
        answer: /^(?:8|eight)(?: positions?)?$/i,
        feedback: "You halved the candidate set.",
      },
      {
        question:
          "Starting again from 16, how many halvings leave just one position?",
        hint: "Write the sizes after each halving and count the transitions, not the numbers.",
        answer: /^(?:4|four)(?: (?:steps?|halvings?|comparisons?))?$/i,
        feedback: "You counted the transitions down to one candidate.",
      },
      {
        question:
          "If the initial size doubles to 32, how many EXTRA halvings are needed to reach one position?",
        hint: "Compare the sequence from 32 with the sequence from 16. Look only at the new beginning.",
        answer: /^(?:1|one)(?: extra)?(?: (?:step|halving|comparison))?$/i,
        feedback: "Doubling the size adds one halving in this model.",
      },
    ],
    reflection:
      "Why does doubling the input add only one step here, while a linear scan may need twice as many? Explain what must be true of the data before you can safely discard half.",
  },
  {
    id: "recursion",
    name: "Find the stopping point",
    topic: "Recursion",
    intro:
      "A function count(n) returns 0 when n == 0. Otherwise, it returns 1 + count(n - 1). Assume n starts as a nonnegative integer.",
    steps: [
      {
        question:
          "For count(2), what argument goes into the very next recursive call?",
        hint: "Use only the expression n - 1. Do not try to finish the whole chain yet.",
        answer: /^(?:1|one|count\(1\))$/i,
        feedback: "The argument gets one smaller.",
      },
      {
        question:
          "At what value of n does this function stop making recursive calls?",
        hint: "Look for the branch whose return expression does not contain count(...).",
        answer: /^(?:0|zero|n\s*={1,2}\s*0)$/i,
        feedback: "That branch is the base case.",
      },
      {
        question:
          "Starting from count(2), how many calls are made in total, including the first call and the base-case call?",
        hint: "Write each call on a separate line until you reach the base case. Count those lines.",
        answer: /^(?:3|three)(?: calls?)?$/i,
        feedback: "You included the first call and the stopping call.",
      },
    ],
    reflection:
      "Would the same stopping rule work if the initial input were -1? Trace two calls, then explain the condition that guarantees progress toward the base case.",
  },
  {
    id: "complexity",
    name: "Count the work",
    topic: "Complexity",
    intro:
      "An outer loop runs n times. For every outer iteration, an inner loop also runs n times. The inner body performs one comparison.",
    steps: [
      {
        question: "When n = 3, how many comparisons happen in total?",
        hint: "Draw one row for each outer iteration and one mark for each inner iteration.",
        answer: /^(?:9|nine)(?: comparisons?)?$/i,
        feedback: "You counted the inner work across every outer iteration.",
      },
      {
        question:
          "When n increases to 6, how many comparisons happen in total?",
        hint: "Both loop counts change. Use the same rows-and-marks approach.",
        answer: /^(?:36|thirty[- ]six)(?: comparisons?)?$/i,
        feedback: "Both dimensions grew when n doubled.",
      },
      {
        question: "How many times larger is the work at n = 6 than at n = 3?",
        hint: "Divide your second total by your first total.",
        answer: /^(?:4|four)(?:x| times)?$/i,
        feedback: "Doubling both dimensions multiplies the work by four.",
      },
    ],
    reflection:
      "How would you express the comparison count in terms of n? Now suppose the inner loop always runs 5 times: explain how the growth changes.",
  },
  {
    id: "debug",
    name: "Trace an index error",
    topic: "Debugging",
    intro:
      "Python code:\n\n```python\nitems = [10, 20, 30]\nfor i in range(len(items) + 1):\n    print(items[i])\n```\n\nPredict the values before changing the code.",
    steps: [
      {
        question: "What is the largest valid index in items?",
        hint: "Python list indexing starts at zero. Write an index under each of the three values.",
        answer: /^(?:2|two)(?: is the largest)?$/i,
        feedback: "You accounted for zero-based indexing.",
      },
      {
        question: "What is the last value produced by range(len(items) + 1)?",
        hint: "Evaluate len(items) + 1, then remember that range stops before its argument.",
        answer: /^(?:3|three)$/i,
        feedback: "That loop value goes past the valid indices.",
      },
      {
        question: "How many values are successfully printed before the error?",
        hint: "Trace i from zero and stop immediately when it no longer names an element.",
        answer: /^(?:3|three)(?: values?)?$/i,
        feedback: "You found the first failing iteration by tracing.",
      },
    ],
    reflection:
      "What relationship should hold between i and len(items) every time the body runs? Use that rule to propose a change, then check your idea on an empty list.",
  },
];

// never claim to grade free-form reasoning with keyword matching.
export function practiceReply(
  state: PracticeState,
  input: string,
  hint = false,
): { state: PracticeState; text: string } {
  const exercise = state.exercise;
  if (state.step >= exercise.steps.length) {
    return {
      state,
      text: `Your explanation is for you to check; guided practice only checks short answers.\n\n${exercise.reflection}\n\nChoose “Discuss with AI” to discuss your reasoning, or choose another exercise.`,
    };
  }
  const step = exercise.steps[state.step];
  if (
    hint ||
    /^(?:hint|i don'?t know|idk|help|stuck)[.! ]*$/i.test(input.trim())
  ) {
    return { state, text: `${step.hint}\n\n${step.question}` };
  }
  const answer = input.trim().replace(/[.!]$/, "");
  if (!step.answer.test(answer)) {
    const next = { ...state, misses: state.misses + 1 };
    return {
      state: next,
      text: `I haven’t matched that to the expected short answer. Try a number on its own; explanations aren’t graded here.\n\n${step.hint}\n\n${step.question}`,
    };
  }
  const next = { ...state, step: state.step + 1, misses: 0 };
  const nextStep = exercise.steps[next.step];
  return {
    state: next,
    text: `${step.feedback}\n\n${nextStep ? nextStep.question : `You’ve checked the small cases. Now explain the idea:\n\n${exercise.reflection}\n\nThis reflection is self-checked. Use the AI tutor to discuss it.`}`,
  };
}
