import type { MathTest } from '../types';
import { DIAGRAM_PRESETS } from '../lib/diagramPresets';

const getPresetUrl = (id: string) =>
  DIAGRAM_PRESETS.find((p) => p.id === id || p.id.startsWith(id))?.dataUrl;

export const SAMPLE_MATH_TESTS: MathTest[] = [
  {
    id: 'sample-mechanics-conics-diagrams',
    title: 'Statics, Dynamics & Conic Sections',
    description: 'Specialized assessment with interactive graphical diagrams covering inclined planes, equilibrium, projectile trajectory, and conic sections.',
    topic: 'Statics',
    difficulty: 'Medium',
    timeLimitMinutes: 15,
    passingScorePercentage: 60,
    authorId: 'system',
    authorName: 'Math Mastery Team',
    isPublic: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    questionCount: 5,
    questions: [
      {
        id: 'diag-q1',
        text: 'A block of mass $m$ rests on an inclined plane of inclination $\\theta$ with coefficient of friction $\\mu$. Refer to the diagram below. What is the minimum coefficient of static friction $\\mu$ required to prevent the block from slipping down the incline?',
        type: 'mcq',
        imageUrl: getPresetUrl('statics-inclined-plane'),
        options: [
          '$\\mu \\ge \\tan \\theta$',
          '$\\mu \\ge \\sin \\theta$',
          '$\\mu \\ge \\cos \\theta$',
          '$\\mu \\ge \\cot \\theta$'
        ],
        correctAnswer: '$\\mu \\ge \\tan \\theta$',
        explanation: 'Resolving forces along the incline: $mg \\sin \\theta - f_s = 0$. Normal force $N = mg \\cos \\theta$. Since maximum friction $f_s \\le \\mu N$, we have $mg \\sin \\theta \\le \\mu mg \\cos \\theta \\implies \\mu \\ge \\tan \\theta$.',
        points: 1,
        hint: 'Equate component of gravity along the incline to the limiting friction force.'
      },
      {
        id: 'diag-q2',
        text: 'Refer to the parabola $y^2 = 4ax$ depicted in the diagram. What is the equation of the directrix line and the coordinates of the focus $S$?',
        type: 'mcq',
        imageUrl: getPresetUrl('conics-parabola'),
        options: [
          'Focus $S(a, 0)$, Directrix $x = -a$',
          'Focus $S(0, a)$, Directrix $y = -a$',
          'Focus $S(-a, 0)$, Directrix $x = a$',
          'Focus $S(2a, 0)$, Directrix $x = -2a$'
        ],
        correctAnswer: 'Focus $S(a, 0)$, Directrix $x = -a$',
        explanation: 'By standard definition of the parabola $y^2 = 4ax$, every point $P(x,y)$ is equidistant from focus $(a, 0)$ and directrix $x = -a$.',
        points: 1,
        hint: 'Recall that for $y^2 = 4ax$, the axis of symmetry is the x-axis.'
      },
      {
        id: 'diag-q3',
        text: 'A projectile is launched from ground level with speed $u$ at angle $\\theta$ to the horizontal as shown in the trajectory diagram. What is the total horizontal range $R$ (neglecting air resistance)?',
        type: 'mcq',
        imageUrl: getPresetUrl('dynamics-projectile-motion'),
        options: [
          '$R = \\frac{u^2 \\sin(2\\theta)}{g}$',
          '$R = \\frac{u^2 \\sin^2 \\theta}{2g}$',
          '$R = \\frac{2u \\sin \\theta}{g}$',
          '$R = \\frac{u^2 \\cos(2\\theta)}{g}$'
        ],
        correctAnswer: '$R = \\frac{u^2 \\sin(2\\theta)}{g}$',
        explanation: 'Time of flight is $T = \\frac{2u\\sin\\theta}{g}$. Horizontal speed is constant at $u_x = u\\cos\\theta$. Thus horizontal range $R = u_x T = \\frac{2u^2 \\sin\\theta \\cos\\theta}{g} = \\frac{u^2 \\sin(2\\theta)}{g}$.',
        points: 1,
        hint: 'Multiply horizontal velocity component by total time of flight.'
      },
      {
        id: 'diag-q4',
        text: 'For the ellipse $\\frac{x^2}{a^2} + \\frac{y^2}{b^2} = 1$ ($a > b$) illustrated with foci $F_1$ and $F_2$, what is the sum of focal distances $PF_1 + PF_2$ for any point $P$ on the curve?',
        type: 'mcq',
        imageUrl: getPresetUrl('conics-ellipse'),
        options: [
          '$2a$',
          '$2b$',
          '$a + b$',
          '$2\\sqrt{a^2 - b^2}$'
        ],
        correctAnswer: '$2a$',
        explanation: 'By the geometric focal definition of an ellipse, the locus of points whose sum of distances from two fixed points (foci) is constant and equals the major axis length: $PF_1 + PF_2 = 2a$.',
        points: 1,
        hint: 'The sum of distances from any point on an ellipse to both foci is equal to the length of the major axis.'
      },
      {
        id: 'diag-q5',
        text: 'Three coplanar forces $F_1, F_2, F_3$ act at a point $O$ in static equilibrium as illustrated in the force diagram. According to Lami\'s Theorem, which relation correctly relates the forces and their opposite angles $\\alpha, \\beta, \\gamma$?',
        type: 'mcq',
        imageUrl: getPresetUrl('statics-lamis-theorem'),
        options: [
          '$\\frac{F_1}{\\sin\\alpha} = \\frac{F_2}{\\sin\\beta} = \\frac{F_3}{\\sin\\gamma}$',
          '$\\frac{F_1}{\\cos\\alpha} = \\frac{F_2}{\\cos\\beta} = \\frac{F_3}{\\cos\\gamma}$',
          '$F_1 \\sin\\alpha = F_2 \\sin\\beta = F_3 \\sin\\gamma$',
          '$\\frac{F_1}{\\tan\\alpha} = \\frac{F_2}{\\tan\\beta} = \\frac{F_3}{\\tan\\gamma}$'
        ],
        correctAnswer: '$\\frac{F_1}{\\sin\\alpha} = \\frac{F_2}{\\sin\\beta} = \\frac{F_3}{\\sin\\gamma}$',
        explanation: 'Lami\'s Theorem states that if three coplanar forces acting at a point are in equilibrium, each force is directly proportional to the sine of the angle between the other two forces.',
        points: 1
      }
    ]
  },
  
  {
    id: 'sample-matrices-1',
    title: 'Matrices and Determinants',
    description: 'Practice and improve your skills in 2x2 and 3x3 matrices, determinants, adjoints, eigenvalues, and inverse operations.',
    topic: 'Matrices and Determinants',
    difficulty: 'Medium',
    timeLimitMinutes: 10,
    passingScorePercentage: 60,
    authorId: 'system',
    authorName: 'Math Mastery Team',
    isPublic: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    questionCount: 20,
    questions: [
      {
        id: 'mat-q1',
        text: 'If $A = \\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}$, what is the determinant $|A|$ ?',
        type: 'mcq',
        options: [
          '-2',
          '2',
          '10',
          '-10'
        ],
        correctAnswer: '-2',
        explanation: 'For a $2 \\times 2$ matrix $A = \\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}$, $|A| = ad - bc = (1)(4) - (2)(3) = 4 - 6 = -2$.',
        points: 1,
        hint: 'Use the standard 2x2 determinant formula: $|A| = ad - bc$.'
      },
      {
        id: 'mat-q2',
        text: 'If $A$ and $B$ are square matrices of order 3 such that $|A| = 4$ and $|B| = -2$, what is the value of $|2AB|$?',
        type: 'mcq',
        options: [
          '-64',
          '-16',
          '64',
          '-32'
        ],
        correctAnswer: '-64',
        explanation: 'For matrices of order $n=3$, $|k M| = k^n |M|$. Thus $|2AB| = 2^3 |AB| = 8 \\times |A||B| = 8 \\times 4 \\times (-2) = -64$.',
        points: 1,
        hint: 'Remember that for an $n \\times n$ matrix, $|kM| = k^n |M|$.'
      },
      {
        id: 'mat-q3',
        text: 'What is the inverse of the matrix $A = \\begin{bmatrix} 2 & 1 \\\\ 5 & 3 \\end{bmatrix}$?',
        type: 'mcq',
        options: [
          '\\begin{bmatrix} 3 & -1 \\\\ -5 & 2 \\end{bmatrix}',
          '\\begin{bmatrix} 3 & 1 \\\\ 5 & 2 \\end{bmatrix}',
          '\\begin{bmatrix} -3 & 1 \\\\ 5 & -2 \\end{bmatrix}',
          '\\begin{bmatrix} 2 & -1 \\\\ -5 & 3 \\end{bmatrix}'
        ],
        correctAnswer: '\\begin{bmatrix} 3 & -1 \\\\ -5 & 2 \\end{bmatrix}',
        explanation: '$|A| = (2)(3) - (1)(5) = 6 - 5 = 1$. The inverse $A^{-1} = \\frac{1}{|A|} \\text{adj}(A) = \\begin{bmatrix} 3 & -1 \\\\ -5 & 2 \\end{bmatrix}$.',
        points: 1
      },
      {
        id: 'mat-q4',
        text: 'If a square matrix $A$ satisfies $A^2 - A + I = O$, then what is the inverse matrix $A^{-1}$?',
        type: 'mcq',
        options: [
          'I - A',
          'A - I',
          'I + A',
          'A + I'
        ],
        correctAnswer: 'I - A',
        explanation: 'Rearranging $A^2 - A + I = O \\implies I = A - A^2 = A(I - A)$. Multiplying both sides by $A^{-1}$ yields $A^{-1} = I - A$.',
        points: 1
      },
      {
        id: 'mat-q5',
        text: 'Find the value of $k$ for which the matrix $\\begin{bmatrix} 2 & k \\\\ 4 & 6 \\end{bmatrix}$ is singular.',
        type: 'mcq',
        options: [
          '3',
          '2',
          '4',
          '6'
        ],
        correctAnswer: '3',
        explanation: 'A matrix is singular if its determinant is zero: $2(6) - 4(k) = 0 \\implies 12 - 4k = 0 \\implies 4k = 12 \\implies k = 3$.',
        points: 1
      },
      {
        id: 'mat-q6',
        text: 'If $A$ is an invertible matrix of order 3 and $|A| = 5$, what is the determinant of its adjoint $|\\text{adj}(A)|$?',
        type: 'mcq',
        options: [
          '25',
          '5',
          '125',
          '1'
        ],
        correctAnswer: '25',
        explanation: 'For an $n \\times n$ matrix, $|\\text{adj}(A)| = |A|^{n-1}$. For $n = 3$, $|\\text{adj}(A)| = 5^{3-1} = 5^2 = 25$.',
        points: 1
      },
      {
        id: 'mat-q7',
        text: 'Evaluate the determinant: $\\begin{vmatrix} \\cos\\theta & -\\sin\\theta \\\\ \\sin\\theta & \\cos\\theta \\end{vmatrix}$',
        type: 'mcq',
        options: [
          '1',
          '0',
          '-1',
          '\\cos(2\\theta)'
        ],
        correctAnswer: '1',
        explanation: 'Determinant $= \\cos\\theta(\\cos\\theta) - (-\\sin\\theta)(\\sin\\theta) = \\cos^2\\theta + \\sin^2\\theta = 1$.',
        points: 1
      },
      {
        id: 'mat-q8',
        text: 'If $A = \\begin{bmatrix} 1 & 0 \\\\ 2 & 1 \\end{bmatrix}$, then what is $A^n$ for any positive integer $n$?',
        type: 'mcq',
        options: [
          '\\begin{bmatrix} 1 & 0 \\\\ 2n & 1 \\end{bmatrix}',
          '\\begin{bmatrix} 1 & 0 \\\\ 2^n & 1 \\end{bmatrix}',
          '\\begin{bmatrix} n & 0 \\\\ 2n & n \\end{bmatrix}',
          '\\begin{bmatrix} 1 & 0 \\\\ 2 & 1 \\end{bmatrix}'
        ],
        correctAnswer: '\\begin{bmatrix} 1 & 0 \\\\ 2n & 1 \\end{bmatrix}',
        explanation: 'By induction or matrix multiplication: $A^2 = \\begin{bmatrix} 1 & 0 \\\\ 4 & 1 \\end{bmatrix}, A^3 = \\begin{bmatrix} 1 & 0 \\\\ 6 & 1 \\end{bmatrix} \\implies A^n = \\begin{bmatrix} 1 & 0 \\\\ 2n & 1 \\end{bmatrix}$.',
        points: 1
      },
      {
        id: 'mat-q9',
        text: 'If $A = \\begin{bmatrix} 3 & 4 \\\\ 1 & 2 \\end{bmatrix}$, what is the trace $\\text{Tr}(A)$ of matrix $A$?',
        type: 'mcq',
        options: [
          '5',
          '2',
          '10',
          '7'
        ],
        correctAnswer: '5',
        explanation: 'The trace is the sum of main diagonal elements: $\\text{Tr}(A) = 3 + 2 = 5$.',
        points: 1
      },
      {
        id: "mat-q10",
        text: "For two invertible square matrices $A$ and $B$, which of the following transpose properties is ALWAYS true?",
        type: "mcq",
        options: [
          "$(AB)^{\\mathrm{T}} = B^{\\mathrm{T}} A^{\\mathrm{T}}$",
          "$AB = BA$",
          "$(AB)^{-1} = A^{-1} B^{-1}$",
          "$|A + B| = |A| + |B|$"
        ],
        correctAnswer: "$(AB)^{\\mathrm{T}} = B^{\\mathrm{T}} A^{\\mathrm{T}}$",
        explanation: "The reversal law for transpose states $(AB)^{\\mathrm{T}} = B^{\\mathrm{T}} A^{\\mathrm{T}}$.",
        points: 1
      },
      {
        id: "mat-q11",
        text: "What is the sum of the eigenvalues of the matrix $A = \\begin{bmatrix} 4 & 2 \\\\ 1 & 3 \\end{bmatrix}$?",
        type: "mcq",
        options: [
          "7",
          "10",
          "12",
          "5"
        ],
        correctAnswer: "7",
        explanation: "The sum of the eigenvalues of a matrix equals its trace: $\\text{Tr}(A) = 4 + 3 = 7$.",
        points: 1
      },
      {
        id: "mat-q12",
        text: "What is the product of the eigenvalues of the matrix $A = \\begin{bmatrix} 5 & 2 \\\\ 3 & 4 \\end{bmatrix}$?",
        type: "mcq",
        options: [
          "14",
          "20",
          "9",
          "12"
        ],
        correctAnswer: "14",
        explanation: "The product of the eigenvalues equals the determinant: $|A| = (5)(4) - (2)(3) = 20 - 6 = 14$.",
        points: 1
      },
      {
        id: "mat-q13",
        text: "If $A$ is a skew-symmetric matrix of order $n$, what can be said about its main diagonal elements?",
        type: "mcq",
        options: [
          "All main diagonal elements are strictly zero",
          "All main diagonal elements are equal to 1",
          "All main diagonal elements are imaginary",
          "Main diagonal elements can be any real numbers"
        ],
        correctAnswer: "All main diagonal elements are strictly zero",
        explanation: "For a skew-symmetric matrix $A^{\\mathrm{T}} = -A$, on the diagonal $a_{ii} = -a_{ii} \\implies 2a_{ii} = 0 \\implies a_{ii} = 0$.",
        points: 1
      },
      {
        id: "mat-q14",
        text: "Which property holds for an orthogonal matrix $Q$?",
        type: "mcq",
        options: [
          "$Q^{\\mathrm{T}} Q = I$",
          "$Q^2 = I$",
          "$|Q| = 0$",
          "$Q^{\\mathrm{T}} = -Q$"
        ],
        correctAnswer: "$Q^{\\mathrm{T}} Q = I$",
        explanation: "By definition, a matrix $Q$ is orthogonal if $Q^{\\mathrm{T}} Q = Q Q^{\\mathrm{T}} = I$, which implies $Q^{-1} = Q^{\\mathrm{T}}$.",
        points: 1
      },
      {
        id: "mat-q15",
        text: "If $A$ is a square matrix of order 3 with determinant $|A| = 3$, what is $|A^{-1}|$?",
        type: "mcq",
        options: [
          "1/3",
          "-3",
          "3",
          "1/9"
        ],
        correctAnswer: "1/3",
        explanation: "The determinant of the inverse matrix is $|A^{-1}| = \\frac{1}{|A|} = \\frac{1}{3}$.",
        points: 1
      },
      {
        id: "mat-q16",
        text: "What is the characteristic equation of the matrix $A = \\begin{bmatrix} 2 & 1 \\\\ 3 & 4 \\end{bmatrix}$?",
        type: "mcq",
        options: [
          "\\lambda^2 - 6\\lambda + 5 = 0",
          "\\lambda^2 - 6\\lambda + 8 = 0",
          "\\lambda^2 - 5\\lambda + 6 = 0",
          "\\lambda^2 - 2\\lambda + 3 = 0"
        ],
        correctAnswer: "\\lambda^2 - 6\\lambda + 5 = 0",
        explanation: "For $2 \\times 2$ matrix, characteristic equation is $\\lambda^2 - \\text{Tr}(A)\\lambda + |A| = 0$. Here $\\text{Tr}(A) = 6$ and $|A| = 8 - 3 = 5$, giving $\\lambda^2 - 6\\lambda + 5 = 0$.",
        points: 1
      },
      {
        id: "mat-q17",
        text: "If $A = \\begin{bmatrix} 1 & 3 \\\\ 2 & 4 \\end{bmatrix}$, what is the value of $A + A^{\\mathrm{T}}$?",
        type: "mcq",
        options: [
          "\\begin{bmatrix} 2 & 5 \\\\ 5 & 8 \\end{bmatrix}",
          "\\begin{bmatrix} 2 & 1 \\\\ 1 & 8 \\end{bmatrix}",
          "\\begin{bmatrix} 1 & 5 \\\\ 5 & 4 \\end{bmatrix}",
          "\\begin{bmatrix} 2 & 6 \\\\ 4 & 8 \\end{bmatrix}"
        ],
        correctAnswer: "\\begin{bmatrix} 2 & 5 \\\\ 5 & 8 \\end{bmatrix}",
        explanation: "$A^{\\mathrm{T}} = \\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}$. Adding elementwise: $\\begin{bmatrix} 1+1 & 3+2 \\\\ 2+3 & 4+4 \\end{bmatrix} = \\begin{bmatrix} 2 & 5 \\\\ 5 & 8 \\end{bmatrix}$.",
        points: 1
      },
      {
        id: 'mat-q18',
        text: 'Which formula expresses the inverse of a non-singular square matrix $A$ in terms of its adjoint?',
        type: 'mcq',
        options: [
          '$A^{-1} = \\frac{1}{|A|} \\mathrm{adj}(A)$',
          '$A^{-1} = |A| \\mathrm{adj}(A)$',
          '$A^{-1} = \\mathrm{adj}(|A|)$',
          '$A^{-1} = \\frac{1}{\\mathrm{adj}(A)}$'
        ],
        correctAnswer: '$A^{-1} = \\frac{1}{|A|} \\mathrm{adj}(A)$',
        explanation: 'By matrix theory, $A \\cdot \\mathrm{adj}(A) = |A| I \\implies A^{-1} = \\frac{1}{|A|} \\mathrm{adj}(A)$.',
        points: 1
      },
      {
        id: "mat-q19",
        text: "What is the determinant of the $3 \\times 3$ identity matrix $I_3$?",
        type: "mcq",
        options: [
          "1",
          "3",
          "0",
          "9"
        ],
        correctAnswer: "1",
        explanation: "The identity matrix of any order always has determinant equal to 1.",
        points: 1
      },
      {
        id: "mat-q20",
        text: "Calculate the determinant of $A = \\begin{bmatrix} 3 & 7 \\\\ 2 & 5 \\end{bmatrix}$.",
        type: "numerical",
        options: [],
        correctAnswer: "1",
        explanation: "$|A| = (3)(5) - (7)(2) = 15 - 14 = 1$.",
        points: 1,
        hint: "Multiply diagonal elements and subtract product of off-diagonal elements."
      }
    ]
  }
];

export const SAMPLE_JSON_TEMPLATE = {
  title: "My Custom Math Mock Test",
  description: "A customized math assessment created in JSON format.",
  topic: "Algebra",
  difficulty: "Medium",
  timeLimitMinutes: 15,
  passingScorePercentage: 60,
  questions: [
    {
      id: "q1",
      text: "Solve for $x$: $3x + 7 = 22$",
      type: "mcq",
      options: [
        "x = 5",
        "x = 6",
        "x = 4",
        "x = 7"
      ],
      correctAnswer: "x = 5",
      explanation: "Subtract 7 from both sides: $3x = 15$. Divide by 3: $x = 5$.",
      points: 1,
      hint: "Isolate the variable term on one side."
    },
    {
      id: "q2",
      text: "Calculate the area of a circle with radius $r = 7$ units (using $\\pi \\approx 22/7$).",
      type: "mcq",
      options: [
        "154",
        "44",
        "88",
        "308"
      ],
      correctAnswer: "154",
      explanation: "Area formula $A = \\pi r^2 = \\frac{22}{7} \\times 7^2 = 22 \\times 7 = 154$ sq units.",
      points: 1
    }
  ]
};