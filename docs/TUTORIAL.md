# CodeTime Language Tutorial & User Guide

Welcome to **CodeTime** — a modern dynamically-typed programming language built from scratch with a stack-based Virtual Machine and a Visual Time-Travel Debugger.

---

## 1. Syntax Overview & Variables

Variables in CodeTime are declared using `let`:

```codetime
let name = "CodeTime"
let version = 1.0
let active = true
let empty = null

print("Language:", name, "Version:", version)
```

---

## 2. Control Flow

### Conditionals (`if`, `elif`, `else`)

```codetime
let score = 85

if score >= 90 {
    print("Grade: A")
} else if score >= 80 {
    print("Grade: B")
} else {
    print("Grade: C")
}
```

### Loops (`while`, `for..in`)

```codetime
// While Loop
let i = 0
while i < 5 {
    print("Count:", i)
    i += 1
}

// For-In Loop over Arrays
let colors = ["red", "green", "blue"]
for c in colors {
    print("Color:", c)
}
```

---

## 3. Functions & Closures

Functions are declared with `fn`. First-class functions, lambdas, and closures capturing lexical upvalues are fully supported.

```codetime
// Named Function
fn fibonacci(n) {
    if n <= 1 { return n }
    return fibonacci(n - 1) + fibonacci(n - 2)
}

print("fib(7) =", fibonacci(7))

// Higher-Order Function & Closure
fn makeAdder(amount) {
    fn add(x) {
        return x + amount
    }
    return add
}

let add10 = makeAdder(10)
print("add10(5) =", add10(5)) // 15
```

---

## 4. Collections (Arrays & Objects)

```codetime
// Arrays
let items = [10, 20, 30]
items.push(40)
print("Array:", items, "Length:", items.length)

// Objects
let user = {
    name: "Alice",
    role: "Engineer"
}
user.role = "Lead Software Engineer"
print("User:", user.name, "Role:", user.role)
```

---

## 5. Struct Declarations

```codetime
struct Point {
    x,
    y
}

let p = Point(10, 20)
print("Point X:", p.x, "Y:", p.y)
```

---

## 6. Built-in Functions

| Function | Description | Example |
|---|---|---|
| `print(...)` | Output values to stdout | `print("Result:", 42)` |
| `len(val)` | Get length of string, array, or object | `len([1, 2, 3])` $\to$ `3` |
| `typeof(val)` | Type name of value | `typeof(42)` $\to$ `"number"` |
| `int(val)` | Truncate/convert to integer | `int("42")` $\to$ `42` |
| `float(val)` | Convert to floating point number | `float("3.14")` $\to$ `3.14` |
| `str(val)` | Convert value to string | `str(100)` $\to$ `"100"` |
| `bool(val)` | Convert value to boolean truthiness | `bool(1)` $\to$ `true` |

---

## 7. Command-Line Interface (`codetime` CLI)

```bash
# Run a CodeTime script
codetime run examples/fibonacci.ct

# Inspect token stream
codetime tokens examples/hello.ct

# Inspect Abstract Syntax Tree (AST)
codetime ast examples/hello.ct

# Output disassembled VM bytecode
codetime compile examples/fibonacci.ct

# Evaluate inline code
codetime eval "let x = 10; print(x * 2)"
```

---

## 8. Time-Travel IDE Usage

Launch the Visual IDE:

```bash
cd packages/ide
npm run dev
```

Open `http://localhost:5173` in your browser:
- **Run**: Executes the script to completion.
- **Debug (F5)**: Begins step-by-step time-travel debugging.
- **Step Over (F10)** / **Step Forward (Alt+Right)** / **Step Backward (Alt+Left)**: Scrub through execution history.
- **Click Timeline**: Instantly jump to any historical execution step!
