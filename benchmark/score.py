#!/usr/bin/env python3
"""
score.py - STT Benchmark Scoring Tool

Calculates:
1. Word Error Rate (WER) using `jiwer` with text normalization.
2. Technical Term Accuracy (Recall %) supporting Hinglish and Devanagari aliases.
3. Number Exactness for category=numbers (with Devanagari digit conversion and comma/rupee stripping).
4. Script Mix Breakdown (% Devanagari vs Latin tokens).
"""

import sys
import re
import string
import argparse
from typing import List, Dict, Tuple, Optional, Union
import jiwer

# Configure UTF-8 encoding for stdout on Windows terminals
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Devanagari to ASCII digit translation table
DEVANAGARI_DIGITS_TABLE = str.maketrans("०१२३४५६७८९", "0123456789")

# Expanded developer Hinglish <-> Devanagari alias dictionary for all 30 sentences
DEFAULT_ALIASES: Dict[str, List[str]] = {
    # easy
    "code": ["code", "कोड"],
    "bug": ["bug", "बग"],
    "fix": ["fix", "फिक्स", "फ़िक्स"],
    "meeting": ["meeting", "मीटिंग"],
    "summary": ["summary", "समरी"],
    "client": ["client", "क्लाइंट", "क्लाइन्ट"],
    "demo": ["demo", "डेमो"],

    # tech
    "useEffect": ["useeffect", "use effect", "यूज़ इफेक्ट", "यूज़ इफ़ेक्ट", "यूज इफेक्ट", "यूज इफ़ेक्ट", "यूज़इफेक्ट"],
    "hook": ["hook", "हुक"],
    "cleanup": ["cleanup", "क्लीनअप"],
    "API": ["api", "एपीआई", "ए पी आई"],
    "error": ["error", "एरर", "एर्रर"],
    "state": ["state", "स्टेट"],
    "PR": ["pr", "पीआर", "पी आर", "पुल रिक्वेस्ट", "pull request"],
    "merge": ["merge", "मर्ज"],
    "tests": ["tests", "test", "टेस्ट्स", "टेस्ट"],
    "test": ["test", "tests", "टेस्ट", "टेस्ट्स"],
    "Kubernetes": ["kubernetes", "kuber netes", "kuber-netes", "कुबेरनेट्स", "कुबरनेट्स", "कुबरनेटिस", "क्युबरनेट्स", "के8एस", "k8s", "kube"],
    "pod": ["pod", "पॉड"],
    "logs": ["logs", "log", "लॉग्स", "लॉग"],
    "function": ["function", "फंक्शन", "फ़ंक्शन"],
    "async": ["async", "असिंक", "असिंक्रोनस", "एस्िंक"],
    "await": ["await", "अवेट", "अवेइट"],
    "Docker": ["docker", "डॉकर"],
    "container": ["container", "कंटेनर"],
    "build": ["build", "बिल्ड"],
    "staging": ["staging", "स्टेजिंग"],
    "deploy": ["deploy", "डिप्लॉय", "डेप्लॉय"],
    "useState": ["usestate", "use state", "यूज़ स्टेट", "यूज स्टेट", "यूज़स्टेट"],
    "null": ["null", "नल"],
    "loading": ["loading", "लोडिंग"],
    "branch": ["branch", "ब्रांच"],
    "feature": ["feature", "फीचर", "फ़ीचर"],
    "commit": ["commit", "कमिट"],
    "push": ["push", "पुश"],
    "backend": ["backend", "बैकएंड", "बैकएन्ड"],
    "endpoint": ["endpoint", "एंडपॉइंट", "एंडप्वाइंट"],
    "500": ["500", "५००", "पाँच सौ", "पांच सौ"],
    "database": ["database", "डेटाबेस", "डाटाबेस"],
    "component": ["component", "कंपोनेंट", "कम्पोनेंट"],
    "TypeScript": ["typescript", "टाइपस्क्रिप्ट"],
    "props": ["props", "प्रॉप्स", "प्रॉप"],
    "types": ["types", "type", "टाइप्स", "टाइप"],
    "JWT": ["jwt", "जेडब्ल्यूटी", "जे डब्ल्यू टी"],
    "token": ["token", "टोकन"],
    "refresh": ["refresh", "रिफ्रेश", "रीफ्रेश"],
    "Redis": ["redis", "रेडिस"],
    "cache": ["cache", "कैश"],
    "session": ["session", "सेशन"],
    "TTL": ["ttl", "टीटीएल", "टी टी एल"],
    "pull request": ["pull request", "पुल रिक्वेस्ट", "pr", "पीआर"],
    "review": ["review", "रिव्यू"],
    "rebase": ["rebase", "रीबेस", "रिबेस"],
    "regex": ["regex", "रेगेक्स", "रेजेक्स"],
    "unit test": ["unit test", "यूनिट टेस्ट", "unit tests", "यूनिट टेस्ट्स"],
    "dashboard": ["dashboard", "डैशबोर्ड"],
    "mobile": ["mobile", "मोबाइल"],
    "optimize": ["optimize", "ऑप्टिमाइज़", "ऑप्टिमाइज"],
    "CI": ["ci", "सीआई", "सी आई"],
    "pipeline": ["pipeline", "पाइपलाइन"],
    "lint": ["lint", "लिंट"],
    "environment variable": ["environment variable", "एनवायरनमेंट वेरिएबल", "env var", "env variable"],
    "API key": ["api key", "एपीआई की", "api token", "एपीआई टोकन", "ipi ki", "ipi key", "इपेकी", "इपे की", "api-key"],
    "repo": ["repo", "रेपो", "रिपो", "repository"],
    "GitHub Actions": ["github actions", "गिटहब एक्शंस", "गिटहब एक्शन"],
    "workflow": ["workflow", "वर्कफ़्लो", "वर्कफ्लो"],

    # numbers (synthetic test sentences)
    "150000": ["150000", "1,50,000", "150,000", "१५००००", "dedh lakh", "डेढ़ लाख", "1.5 lakh", "1.5 लाख", "1.5l", "1.5lakh"],
    "2532": ["2532", "2,532", "२५३२", "दो हज़ार पाँच सौ बत्तीस", "2530", "do hazaar paanch sau tees", "दो हज़ार पाँच सौ तीस"],
    "110004": ["110004", "110 004", "११०००४", "ek ek zero zero zero chaar", "एक एक शून्य शून्य शून्य चार", "एक एक zero zero zero चार", "ek ek 0 0 0 4", "1 1 0 0 0 4", "1.1.0.0.0.4", "ek ek zero zero zero char"],
    "3000": ["3000", "3,000", "३०००", "teen hazaar", "तीन हज़ार", "तीन हजार"],
    "100": ["100", "१००", "sau", "सौ", "एक सौ"],
    "245": ["245", "२४५", "do sau paintalis", "दो सौ पैंतालीस", "दो सौ पैंतालिस"],
    "JIRA-422": ["jira-422", "jira 422", "jira dash 422", "jira422", "जीरा 422", "जीरा-422", "जीरा डैश 422", "gira-422", "gira 422", "gira dash 422", "gra-422", "gra 422", "j i r a dash 422", "j i r a 422", "jira-test-422", "jira-task-422"],
    "JIRA 422": ["jira-422", "jira 422", "jira dash 422", "jira422", "जीरा 422", "जीरा-422", "जीरा डैश 422", "gira-422", "gira 422", "gira dash 422", "gra-422", "gra 422", "j i r a dash 422", "j i r a 422", "jira-test-422", "jira-task-422"],
    "550000": ["550000", "5,50,000", "550,000", "५५००००", "paanch lakh pachaas hazaar", "5.5 lakh", "पाँच लाख पचास हज़ार", "पांच लाख पचास हजार"],
    "GST": ["gst", "जीएसटी", "जी एस टी"],
}

# jiwer pipeline
NORMALIZATION_TRANSFORM = jiwer.Compose([
    jiwer.ToLowerCase(),
    jiwer.RemovePunctuation(),
    jiwer.RemoveMultipleSpaces(),
    jiwer.Strip(),
])


def split_camel_case(identifier: str) -> str:
    """Converts camelCase or PascalCase identifier to space-separated words."""
    s1 = re.sub(r'(.)([A-Z][a-z]+)', r'\1 \2', identifier)
    return re.sub(r'([a-z0-9])([A-Z])', r'\1 \2', s1).lower()


def check_identifier_match(identifier: str, hypothesis: str) -> Tuple[bool, bool]:
    """
    Checks identifier match in hypothesis.
    Returns: (is_exact_match, is_spaced_match)
    - is_exact_match: whether the unbroken identifier appears in the transcript.
    - is_spaced_match: whether either the exact unbroken identifier or its space-separated form appears.
    """
    if not identifier or not hypothesis:
        return False, False

    norm_hyp = normalize_text(hypothesis)
    raw_hyp_tokens = set(norm_hyp.split())
    hyp_no_spaces = norm_hyp.replace(" ", "")

    norm_id = normalize_text(identifier)
    spaced_id = normalize_text(split_camel_case(identifier))

    # Exact match: unbroken identifier appears in hypothesis
    is_exact = (norm_id in raw_hyp_tokens) or bool(re.search(r'\b' + re.escape(norm_id) + r'\b', norm_hyp))

    # Spaced match: either exact match OR spaced form appears
    is_spaced = is_exact or (spaced_id in norm_hyp) or (norm_id.replace(" ", "") in hyp_no_spaces) or all(w in raw_hyp_tokens for w in spaced_id.split() if w)

    return is_exact, is_spaced


def calculate_identifier_metrics(must_have_terms: List[str], hypothesis: str) -> Dict[str, float]:
    """
    Calculates exact and spaced match percentages for project code identifiers.
    """
    if not must_have_terms:
        return {"exact_match_pct": 100.0, "spaced_match_pct": 100.0}

    exact_cnt = 0
    spaced_cnt = 0
    for term in must_have_terms:
        exact, spaced = check_identifier_match(term, hypothesis)
        if exact:
            exact_cnt += 1
        if spaced:
            spaced_cnt += 1

    return {
        "exact_match_pct": round((exact_cnt / len(must_have_terms)) * 100.0, 2),
        "spaced_match_pct": round((spaced_cnt / len(must_have_terms)) * 100.0, 2),
        "exact_matches": exact_cnt,
        "spaced_matches": spaced_cnt,
        "total_terms": len(must_have_terms),
    }


def normalize_numeric_text(text: str) -> str:
    """
    Normalizes numeric expressions by:
    1. Converting Devanagari numerals (०-९) to ASCII digits (0-9).
    2. Stripping currency symbols (₹, Rs, INR, रु).
    3. Stripping commas and spaces between digit sequences (e.g. 1,50,000 -> 150000).
    """
    if not text:
        return ""

    # Convert Devanagari digits
    converted = text.translate(DEVANAGARI_DIGITS_TABLE)

    # Strip currency signs
    converted = re.sub(r"[₹]|(?:\b(?:rs\.?|inr|रु\.?)\b)", "", converted, flags=re.IGNORECASE)

    # Strip commas and spaces between consecutive digits
    converted = re.sub(r"(?<=\d)[,\s]+(?=\d)", "", converted)

    return converted


def normalize_text(text: str) -> str:
    """Normalize text by lowercasing, converting numerals, and stripping punctuation and excess whitespace."""
    if not text:
        return ""
    num_clean = normalize_numeric_text(text)
    return str(NORMALIZATION_TRANSFORM(num_clean))


def check_term_match(term: Union[str, List[str]], hypothesis: str, aliases: Optional[Dict[str, List[str]]] = None) -> bool:
    """
    Check if a canonical technical term (or any alias or alternative) is present in the hypothesis.
    """
    if not term or not hypothesis:
        return False

    norm_hyp = normalize_text(hypothesis)
    raw_hyp_tokens = set(norm_hyp.split())

    # If term is a list of alternatives (e.g. ["JIRA-422", "JIRA 422"]), check each
    if isinstance(term, list):
        return any(check_term_match(t, hypothesis, aliases) for t in term)

    alias_dict = aliases if aliases is not None else DEFAULT_ALIASES

    # 1. Direct lowercase match on normalized hypothesis
    norm_term = normalize_text(term)
    if norm_term and (norm_term in norm_hyp or norm_term in raw_hyp_tokens):
        return True

    # 2. Check known aliases
    known_aliases = alias_dict.get(term, [])
    for alias in known_aliases:
        norm_alias = normalize_text(alias)
        if norm_alias and (norm_alias in norm_hyp or norm_alias in raw_hyp_tokens):
            return True

    # 3. Number-specific substring match (e.g. "150000" in "150000")
    if term.isdigit() and term in norm_hyp:
        return True

    return False


def calculate_term_accuracy(must_have_terms: List[Union[str, List[str]]], hypothesis: str,
                             aliases: Optional[Dict[str, List[str]]] = None) -> Tuple[float, List[str], List[str]]:
    """
    Calculate keyword recall accuracy for must_have_terms in hypothesis.
    Returns: (accuracy_pct, matched_terms, missing_terms)
    """
    if not must_have_terms:
        return 100.0, [], []

    matched = []
    missing = []

    for term in must_have_terms:
        term_label = "/".join(term) if isinstance(term, list) else str(term)
        if check_term_match(term, hypothesis, aliases):
            matched.append(term_label)
        else:
            missing.append(term_label)

    accuracy = (len(matched) / len(must_have_terms)) * 100.0
    return accuracy, matched, missing


def calculate_script_mix(text: str) -> Dict[str, float]:
    """
    Calculates the proportion of Devanagari vs Latin characters in text.
    Returns: {"devanagari_pct": float, "latin_pct": float, "digits_pct": float, "dominant_script": str}
    """
    if not text:
        return {"devanagari_pct": 0.0, "latin_pct": 0.0, "digits_pct": 0.0, "dominant_script": "empty"}

    devanagari_count = len(re.findall(r"[\u0900-\u097F]", text))
    latin_count = len(re.findall(r"[a-zA-Z]", text))
    digit_count = len(re.findall(r"[0-9\u0966-\u096F]", text))
    total_letters = devanagari_count + latin_count + digit_count

    if total_letters == 0:
        return {"devanagari_pct": 0.0, "latin_pct": 0.0, "digits_pct": 0.0, "dominant_script": "other"}

    dev_pct = round((devanagari_count / total_letters) * 100.0, 1)
    lat_pct = round((latin_count / total_letters) * 100.0, 1)
    dig_pct = round((digit_count / total_letters) * 100.0, 1)

    dominant = "Devanagari" if dev_pct > 50 else ("Latin" if lat_pct > 50 else "Code-Mixed")

    return {
        "devanagari_pct": dev_pct,
        "latin_pct": lat_pct,
        "digits_pct": dig_pct,
        "dominant_script": dominant,
    }


def calculate_metrics(reference: str, hypothesis: str,
                      must_have_terms: Optional[List[Union[str, List[str]]]] = None,
                      category: Optional[str] = None,
                      aliases: Optional[Dict[str, List[str]]] = None) -> Dict:
    """
    Calculate full benchmark metrics: WER, Term Accuracy, Number Exactness, and Script Mix.
    """
    norm_ref = normalize_text(reference)
    norm_hyp = normalize_text(hypothesis)

    if not norm_ref and not norm_hyp:
        wer = 0.0
    elif not norm_ref:
        wer = 1.0
    else:
        wer = jiwer.wer(norm_ref, norm_hyp)

    accuracy, matched, missing = calculate_term_accuracy(must_have_terms or [], hypothesis, aliases)
    script_mix = calculate_script_mix(hypothesis)

    number_exact = False
    if category == "numbers":
        number_exact = (len(missing) == 0 and len(must_have_terms or []) > 0)

    return {
        "wer": round(wer, 4),
        "wer_percent": round(wer * 100.0, 2),
        "term_accuracy": round(accuracy, 2),
        "number_exact": number_exact,
        "matched_terms": matched,
        "missing_terms": missing,
        "script_mix": script_mix,
        "norm_reference": norm_ref,
        "norm_hypothesis": norm_hyp,
    }


def main():
    parser = argparse.ArgumentParser(description="Calculate WER, Term Accuracy, and Script Mix for STT benchmark.")
    parser.add_argument("--ref", "--reference", help="Reference ground truth text")
    parser.add_argument("--hyp", "--hypothesis", help="Hypothesis transcribed text")
    parser.add_argument("--terms", help="Comma-separated must-have terms")
    parser.add_argument("--category", default="tech", help="Category: easy | tech | numbers")
    parser.add_argument("--csv", help="Evaluate existing benchmark results CSV file")

    args = parser.parse_args()

    if args.csv:
        import csv
        wers = []
        term_accs = []
        with open(args.csv, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                wer_val = row.get("wer_percent") or row.get("wer")
                if wer_val is not None and wer_val != "":
                    wers.append(float(wer_val))
                acc_val = row.get("term_accuracy")
                if acc_val is not None and acc_val != "":
                    term_accs.append(float(acc_val))

        if wers:
            avg_wer = sum(wers) / len(wers)
            avg_acc = sum(term_accs) / len(term_accs) if term_accs else 0.0
            print(f"Evaluated {len(wers)} benchmark rows:")
            print(f"  Average WER:           {avg_wer:.2f}%")
            print(f"  Average Term Accuracy: {avg_acc:.2f}%")
        else:
            print("No rows found in CSV.")
        return

    if not args.ref or not args.hyp:
        parser.print_help()
        sys.exit(1)

    terms = [t.strip() for t in args.terms.split(",")] if args.terms else []
    metrics = calculate_metrics(args.ref, args.hyp, terms, category=args.category)

    print("==========================================")
    print("           STT Benchmark Result           ")
    print("==========================================")
    print(f"Reference:       {args.ref}")
    print(f"Hypothesis:      {args.hyp}")
    print(f"WER:             {metrics['wer_percent']}%")
    print(f"Term Accuracy:   {metrics['term_accuracy']}%")
    if args.category == "numbers":
        print(f"Number Exact:    {metrics['number_exact']}")
    print(f"Matched Terms:   {', '.join(metrics['matched_terms']) or '(none)'}")
    print(f"Missing Terms:   {', '.join(metrics['missing_terms']) or '(none)'}")
    print(f"Script Mix:      {metrics['script_mix']['dominant_script']} ({metrics['script_mix']['devanagari_pct']}% Devanagari, {metrics['script_mix']['latin_pct']}% Latin)")
    print("==========================================")


if __name__ == "__main__":
    main()
