# CodeTime Language Specification

**Version 1.0** | Language design document for the CodeTime programming language.

---

## Overview

CodeTime is a dynamically-typed, expression-oriented language with lexical scoping, first-class functions, and built-in support for arrays and objects. It is designed to be simple enough to compile completely from scratch while being expressive enough to write interesting programs.

The syntax is inspired by Rust, Go, and Python. Significant whitespace (newlines as statement separators) is used, similar to Go's implicit semicolons.

---

## 1. Lexical Structure

### 1.1 Source encoding

CodeTime source files are UTF-8 encoded. The file extension is `.ct`.

### 1.2 Whitespace

Spaces and tabs are ignored (except inside strings). Newlines act as implicit statement terminators under the following rule:

> A newline is significant (acts as a statement separator) if and only if the previous token was a **value-producing token** — an identifier, a literal, a closing bracket `)`, `]`, `}`, or the keywords `break`, `continue`, `return`.

In all other positions (after an operator, comma, opening bracket, or at the start of file) newlines are ignored so multi-line expressions work naturally.

### 1.3 Comments

Single-line comments begin with `//` or `#` and extend to end of line.

```codetime
// This is a comment
# This is also a comment
let x = 42  // inline comment
```

Block comments are not currently supported.

### 1.4 Identifiers

Identifiers start with a letter (`a-z`, `A-Z`) or underscore (`_`), followed by any number of letters, digits, or underscores.

```
identifier ::= [a-zA-Z_][a-zA-Z0-9_]*
```

Identifiers are case-sensitive: `foo`, `Foo`, and `FOO` are distinct.

### 1.5 Keywords

The following identifiers are reserved keywords:

```
let  fn  return  if  else  while  for  in  break  continue
true  false  null  print  and  or  not  struct
```

### 1.6 Literals

| Kind    | Examples                     | Notes                              |
|---------|------------------------------|------------------------------------|
| Integer | `0`, `42`, `1000000`         | 64-bit signed integer              |
| Float   | `3.14`, `0.5`, `2.718`       | 64-bit IEEE 754 double             |
| String  | `"hello"`, `'world'`         | Single or double quoted            |
| Boolean | `true`, `false`              |                                    |
| Null    | `null`                       | Absence of value                   |

**String escape sequences:**

| Sequence | Meaning         |
|----------|-----------------|
| `\n`     | Newline         |
| `\t`     | Tab             |
| `\r`     | Carriage return |
| `\\`     | Backslash       |
| `\"`     | Double quote    |
| `\'`     | Single quote    |
| `\0`     | Null byte       |

---

## 2. Types

CodeTime is dynamically typed. Values carry their own type at runtime.

| Type      | Description                       |
|-----------|-----------------------------------|
| `integer` | 64-bit signed integer             |
| `float`   | 64-bit IEEE 754 double            |
| `string`  | UTF-8 string                      |
| `boolean` | `true` or `false`                 |
| `null`    | Null / absence                    |
| `array`   | Dynamic heterogeneous array       |
| `object`  | Key-value map (string keys)       |
| `function`| First-class function value        |

---

## 3. Expressions

### 3.1 Operator Precedence (highest to lowest)

| Level | Operator(s)              | Associativity |
|-------|--------------------------|---------------|
| 8     | `-` `not` `!` (unary)    | Right         |
| 7     | `**`                     | Right         |
| 6     | `*` `/` `%`              | Left          |
| 5     | `+` `-`                  | Left          |
| 4     | `<` `<=` `>` `>=`        | Left          |
| 3     | `==` `!=`                | Left          |
| 2     | `and`                    | Left          |
| 1     | `or`                     | Left          |

### 3.2 Arithmetic

```codetime
let a = 10 + 3    // 13
let b = 10 - 3    // 7
let c = 10 * 3    // 30
let d = 10 / 3    // 3 (integer division when both operands are integers)
let e = 10 % 3    // 1
let f = 2 ** 8    // 256
```

If either operand of `/` is a float, the result is a float:
```codetime
let g = 10.0 / 3  // 3.3333...
```

### 3.3 Comparison

```codetime
1 == 1     // true
1 != 2     // true
3 < 5      // true
3 <= 3     // true
5 > 3      // true
5 >= 5     // true
```

### 3.4 Logical operators

```codetime
true and false   // false
true or false    // true
not true         // false
```

`and` and `or` are short-circuit operators.

### 3.5 String concatenation

The `+` operator concatenates strings:

```codetime
let greeting = "Hello, " + "world!"
```

### 3.6 Grouping

Parentheses override precedence:

```codetime
(2 + 3) * 4   // 20  (not 14)
```

### 3.7 Array literals

```codetime
let numbers = [1, 2, 3, 4, 5]
let mixed   = [1, "hello", true, null]
let nested  = [[1, 2], [3, 4]]
```

### 3.8 Object literals

```codetime
let point = { x: 10, y: 20 }
let person = { name: "Alice", age: 30, active: true }
```

### 3.9 Index access

```codetime
numbers[0]       // 1 (first element)
numbers[4]       // 5
nested[1][0]     // 3
person["name"]   // "Alice"
```

### 3.10 Member access

```codetime
point.x          // 10  (sugar for point["x"])
person.name      // "Alice"
```

### 3.11 Function calls

```codetime
add(1, 2)
obj.method(arg)
arr[0](args)    // calling a function stored in an array
```

### 3.12 Function expressions (lambdas)

```codetime
let double = fn(x) { return x * 2 }
let result = double(5)   // 10
```

---

## 4. Statements

### 4.1 Variable declaration

```codetime
let x = 42
let name = "Alice"
let values = [1, 2, 3]
let result         // declared without initializer; value is null
```

Variables are block-scoped (lexical scoping). Re-declaration in the same scope is an error.

### 4.2 Assignment

```codetime
x = 100
name = "Bob"
values[0] = 99
point.x = 50
```

Note: assignment is a **statement**, not an expression. `let x = y = 1` is a parse error.

### 4.3 Compound assignment

```codetime
x += 5    // x = x + 5
x -= 3    // x = x - 3
x *= 2    // x = x * 2
x /= 4    // x = x / 4
```

### 4.4 Function declaration

```codetime
fn add(a, b) {
    return a + b
}
```

Functions defined with `fn` at statement level are hoisted to the top of their enclosing scope (like `let` but callable before the declaration). Function names are bound in the enclosing scope.

### 4.5 Return

```codetime
fn greet(name) {
    return "Hello, " + name
}
```

A bare `return` (no value) returns `null`.

### 4.6 If / else

```codetime
if condition {
    // consequent
}

if condition {
    // if-branch
} else {
    // else-branch
}

if a > b {
    // ...
} else if a == b {
    // ...
} else {
    // ...
}
```

The condition does not require parentheses. The braces are required.

### 4.7 While loop

```codetime
let i = 0
while i < 10 {
    print(i)
    i += 1
}
```

### 4.8 For-in loop

Iterates over an array:

```codetime
let items = [1, 2, 3, 4, 5]
for item in items {
    print(item)
}
```

### 4.9 Break and continue

```codetime
while true {
    if done { break }
    if skip { continue }
    doWork()
}
```

### 4.10 Print statement

`print` is a built-in that writes values to standard output:

```codetime
print("Hello, world!")
print(x, y, z)          // multiple arguments, space-separated
print()                  // empty line
```

---

## 5. Scoping

CodeTime uses **lexical (static) scoping**. Each block `{ ... }` introduces a new scope. Variables are looked up in the nearest enclosing scope chain.

```codetime
let x = 10

fn outer() {
    let y = 20

    fn inner() {
        let z = 30
        print(x + y + z)  // 60 — captures x and y from outer scopes
    }

    inner()
}
```

---

## 6. Functions

Functions are first-class values. They can be:

- Assigned to variables
- Passed as arguments
- Returned from other functions
- Stored in arrays and objects

```codetime
fn apply(f, x) {
    return f(x)
}

fn double(n) { return n * 2 }

print(apply(double, 5))   // 10
```

### 6.1 Closures

Functions close over variables in their enclosing lexical scope:

```codetime
fn makeCounter() {
    let count = 0
    fn increment() {
        count += 1
        return count
    }
    return increment
}

let counter = makeCounter()
print(counter())   // 1
print(counter())   // 2
print(counter())   // 3
```

### 6.2 Recursion

```codetime
fn factorial(n) {
    if n <= 1 { return 1 }
    return n * factorial(n - 1)
}
```

---

## 7. Arrays

Arrays are dynamic (can grow and shrink) and heterogeneous.

```codetime
let arr = [10, 20, 30]

// Index access (0-based)
arr[0]          // 10

// Index assignment
arr[1] = 99

// Built-in array properties/methods (accessed via dot syntax):
arr.length      // 3
arr.push(40)    // appends 40; arr is now [10, 99, 30, 40]
arr.pop()       // removes and returns last element
arr.len()       // same as arr.length
```

---

## 8. Objects

Objects are unordered key-value maps with string keys:

```codetime
let p = { x: 0, y: 0 }
p.x = 10
p["y"] = 20
print(p.x + p.y)   // 30
```

---

## 9. Structs (planned)

Structs are named object templates:

```codetime
struct Point {
    x
    y
}

let p = Point { x: 10, y: 20 }
print(p.x)   // 10
```

---

## 10. Error Handling

CodeTime does not have exceptions. Errors are runtime panics that terminate execution with a descriptive message and source location. The time-travel debugger allows stepping back to before the error to inspect the state.

---

## 11. Built-in Functions and Properties

| Name/Property       | Description                                            |
|---------------------|--------------------------------------------------------|
| `print(...args)`    | Print arguments to stdout                              |
| `len(x)`            | Length of string or array                              |
| `typeof(x)`         | Returns type name as string                            |
| `int(x)`            | Convert to integer                                     |
| `float(x)`          | Convert to float                                       |
| `str(x)`            | Convert to string                                      |
| `bool(x)`           | Convert to boolean                                     |
| `array.length`      | Number of elements                                     |
| `array.push(v)`     | Append element                                         |
| `array.pop()`       | Remove and return last element                         |
| `string.length`     | Number of characters                                   |

---

## 12. Grammar (EBNF)

```ebnf
program         ::= statement* EOF

statement       ::= letStmt
                  | assignStmt
                  | compoundAssignStmt
                  | fnStmt
                  | returnStmt
                  | ifStmt
                  | whileStmt
                  | forInStmt
                  | breakStmt
                  | continueStmt
                  | exprStmt
                  | structStmt
                  | NEWLINE

letStmt         ::= 'let' IDENTIFIER ('=' expression)? NEWLINE
assignStmt      ::= assignTarget '=' expression NEWLINE
compoundAssignStmt ::= assignTarget ('+=' | '-=' | '*=' | '/=') expression NEWLINE
assignTarget    ::= IDENTIFIER | indexExpr | memberExpr
fnStmt          ::= 'fn' IDENTIFIER '(' paramList ')' blockStmt
returnStmt      ::= 'return' expression? NEWLINE
ifStmt          ::= 'if' expression blockStmt ('else' (blockStmt | ifStmt))?
whileStmt       ::= 'while' expression blockStmt
forInStmt       ::= 'for' IDENTIFIER 'in' expression blockStmt
breakStmt       ::= 'break' NEWLINE
continueStmt    ::= 'continue' NEWLINE
exprStmt        ::= expression NEWLINE
structStmt      ::= 'struct' IDENTIFIER '{' NEWLINE identifierList NEWLINE '}'
blockStmt       ::= '{' NEWLINE? statement* '}'

paramList       ::= (IDENTIFIER (',' IDENTIFIER)*)?
identifierList  ::= (IDENTIFIER NEWLINE)*

expression      ::= orExpr
orExpr          ::= andExpr ('or' andExpr)*
andExpr         ::= equalityExpr ('and' equalityExpr)*
equalityExpr    ::= relationalExpr (('==' | '!=') relationalExpr)*
relationalExpr  ::= addExpr (('<' | '<=' | '>' | '>=') addExpr)*
addExpr         ::= mulExpr (('+' | '-') mulExpr)*
mulExpr         ::= powerExpr (('*' | '/' | '%') powerExpr)*
powerExpr       ::= unaryExpr ('**' powerExpr)?  // right-associative
unaryExpr       ::= ('-' | 'not' | '!') unaryExpr
                  | postfixExpr
postfixExpr     ::= primary (callSuffix | indexSuffix | memberSuffix)*
callSuffix      ::= '(' argList ')'
indexSuffix     ::= '[' expression ']'
memberSuffix    ::= '.' IDENTIFIER
argList         ::= (expression (',' expression)*)?

primary         ::= INTEGER | FLOAT | STRING | BOOLEAN | NULL
                  | IDENTIFIER
                  | '(' expression ')'
                  | arrayLiteral
                  | objectLiteral
                  | fnExpr
                  | printExpr

arrayLiteral    ::= '[' (expression (',' expression)*)? ']'
objectLiteral   ::= '{' (IDENTIFIER ':' expression (',' IDENTIFIER ':' expression)*)? '}'
fnExpr          ::= 'fn' '(' paramList ')' blockStmt
printExpr       ::= 'print' '(' argList ')'
```

---

## 13. Standard Example Programs

See the `examples/` directory for:

- `hello.ct` — Hello World
- `fibonacci.ct` — Fibonacci sequence
- `factorial.ct` — Recursive factorial
- `arrays.ct` — Array operations
- `closures.ct` — Closure and higher-order functions
- `recursion.ct` — Tree recursion
- `sorting.ct` — Bubble sort
- `loops.ct` — Nested loops
- `buggy.ct` — Intentionally buggy program for time-travel debugging demo
