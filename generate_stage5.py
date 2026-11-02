"""Генератор данных для Этапа 5.

Создаёт для задач task_2..task_12 по два файла в папке files/:
  taskX_small.txt — 10 строк,
  taskX_big.txt   — 1000 строк,
и считает эталонные ответы для каждого файла.

Запуск: python generate_stage5.py
"""
import os
import random
import re

random.seed(20261029)

BASE = os.path.dirname(os.path.abspath(__file__))
FILES = os.path.join(BASE, "files")
os.makedirs(FILES, exist_ok=True)

ABC = "ABC"
ABCDE = "ABCDE"
ABCDEF = "ABCDEF"
LETTERS_Z = "ABCXYZ"
LETTERS_DIGITS = "ABCDXYZ0123456789"

VOWELS = set("AE")


# ---------- генерация строк ----------

def make_random_lines(n, alphabet, length_range):
    lines = []
    for _ in range(n):
        length = random.randint(*length_range)
        lines.append("".join(random.choice(alphabet) for _ in range(length)))
    return lines


def make_run_lines(n, alphabet, runs_range, run_len_range):
    """Строки из подряд идущих цепочек одинаковых символов заданной длины."""
    lines = []
    for _ in range(n):
        runs_count = random.randint(*runs_range)
        parts = []
        prev = None
        for _ in range(runs_count):
            ch = random.choice(alphabet)
            while ch == prev:
                ch = random.choice(alphabet)
            prev = ch
            parts.append(ch * random.randint(*run_len_range))
        lines.append("".join(parts))
    return lines


def make_digit_group_lines(n, alphabet, groups_range):
    """Строки из букв и групп ровно из четырёх цифр подряд."""
    lines = []
    letters = "ABCDXYZ"
    digits = "0123456789"
    for _ in range(n):
        parts = []
        groups = random.randint(*groups_range)
        for _ in range(groups):
            parts.append("".join(random.choice(letters) for _ in range(random.randint(1, 3))))
            parts.append("".join(random.choice(digits) for _ in range(4)))
        parts.append("".join(random.choice(letters) for _ in range(random.randint(1, 3))))
        lines.append("".join(parts))
    return lines


def make_number_lines(n, alphabet, count_range):
    """Строки из натуральных чисел, разделённых пробелами."""
    lines = []
    for _ in range(n):
        count = random.randint(*count_range)
        nums = [random.randint(1, 9999) for _ in range(count)]
        if not any(x % 2 == 0 for x in nums):
            nums[0] = random.choice([2, 4, 6, 8, 100, 2468])  # гарантируем чётное
        lines.append(" ".join(str(x) for x in nums))
    return lines


def write_lines(path, lines):
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


# ---------- эталонные алгоритмы ----------

def answer_2(lines):
    """Количество троек подряд идущих символов с тремя разными буквами."""
    total = 0
    for s in lines:
        for i in range(len(s) - 2):
            if len(set(s[i:i + 3])) == 3:
                total += 1
    return total


def answer_3(lines):
    """Количество вхождений сочетания AB."""
    return sum(s.count("AB") for s in lines)


def answer_4(lines):
    """Максимум идущих подряд пар «согласная + гласная»."""
    best = 0
    for s in lines:
        cur = 0
        for i in range(0, len(s) - 1, 2):
            pair = s[i:i + 2]
            if pair[0] not in VOWELS and pair[1] in VOWELS:
                cur += 1
                if cur > best:
                    best = cur
            else:
                cur = 0
    return best


def answer_5(lines):
    """Минимальная длина цепочки одинаковых символов."""
    best = None
    for s in lines:
        i = 0
        while i < len(s):
            j = i
            while j < len(s) and s[j] == s[i]:
                j += 1
            run = j - i
            if best is None or run < best:
                best = run
            i = j
    return best


def answer_6(lines):
    """Количество строк, заканчивающихся на Z."""
    return sum(1 for s in lines if s.endswith("Z"))


def answer_7(lines):
    """Сумма всех цифр в файле."""
    return sum(int(ch) for s in lines for ch in s if ch.isdigit())


def answer_8(lines):
    """Максимум подряд идущих символов, где 'A' встречается не более 3 раз."""
    best = 0
    for s in lines:
        left = 0
        count_a = 0
        for right in range(len(s)):
            if s[right] == "A":
                count_a += 1
            while count_a > 3:
                if s[left] == "A":
                    count_a -= 1
                left += 1
            if right - left + 1 > best:
                best = right - left + 1
    return best


def answer_9(lines):
    """Максимальная подстрока без повторяющихся символов."""
    best = 0
    for s in lines:
        seen = set()
        left = 0
        for right in range(len(s)):
            while s[right] in seen:
                seen.remove(s[left])
                left += 1
            seen.add(s[right])
            if right - left + 1 > best:
                best = right - left + 1
    return best


def answer_10(lines):
    """Количество групп ровно из четырёх цифр подряд."""
    text = "\n".join(lines)
    return len(re.findall(r"(?<!\d)\d{4}(?!\d)", text))


def answer_11(lines):
    """Максимальное чётное число в файле."""
    text = "\n".join(lines)
    nums = [int(x) for x in re.findall(r"\d+", text)]
    evens = [x for x in nums if x % 2 == 0]
    return max(evens) if evens else 0


def answer_12(lines):
    """Самая длинная цепочка из символов X, Y, Z подряд."""
    best = 0
    for s in lines:
        cur = 0
        for ch in s:
            if ch in "XYZ":
                cur += 1
                if cur > best:
                    best = cur
            else:
                cur = 0
    return best


TASKS = [
    ("task_2", ABC, make_random_lines, dict(length_range=(10, 15)), dict(length_range=(20, 30)), answer_2),
    ("task_3", ABC, make_random_lines, dict(length_range=(10, 15)), dict(length_range=(20, 30)), answer_3),
    ("task_4", ABCDE, make_random_lines, dict(length_range=(10, 14)), dict(length_range=(20, 30)), answer_4),
    ("task_5", ABC, make_run_lines, dict(runs_range=(3, 5), run_len_range=(3, 7)),
                                        dict(runs_range=(6, 10), run_len_range=(3, 7)), answer_5),
    ("task_6", LETTERS_Z, make_random_lines, dict(length_range=(5, 10)), dict(length_range=(5, 12)), answer_6),
    ("task_7", LETTERS_DIGITS, make_random_lines, dict(length_range=(10, 15)), dict(length_range=(20, 30)), answer_7),
    ("task_8", ABC, make_random_lines, dict(length_range=(15, 25)), dict(length_range=(20, 30)), answer_8),
    ("task_9", ABCDEF, make_random_lines, dict(length_range=(15, 25)), dict(length_range=(20, 30)), answer_9),
    ("task_10", "X", make_digit_group_lines, dict(groups_range=(2, 4)), dict(groups_range=(3, 6)), answer_10),
    ("task_11", "X", make_number_lines, dict(count_range=(3, 6)), dict(count_range=(5, 9)), answer_11),
    ("task_12", "ABCXYZ", make_random_lines, dict(length_range=(15, 25)), dict(length_range=(20, 30)), answer_12),
]

for task_id, alphabet, maker, small_kw, big_kw, answer_func in TASKS:
    small_lines = maker(10, alphabet, **small_kw)
    big_lines = maker(1000, alphabet, **big_kw)

    small_path = os.path.join(FILES, task_id + "_small.txt")
    big_path = os.path.join(FILES, task_id + "_big.txt")
    write_lines(small_path, small_lines)
    write_lines(big_path, big_lines)

    exp_small = answer_func(small_lines)
    exp_big = answer_func(big_lines)

    print(f"{task_id}: small={exp_small}  big={exp_big}")

print("\n--- Пример первых строк (для контроля) ---")
for task_id, _, _, _, _, _ in TASKS:
    with open(os.path.join(FILES, task_id + "_small.txt"), encoding="utf-8") as f:
        first = f.readline().rstrip("\n")
    print(f"{task_id}: {first!r}")
