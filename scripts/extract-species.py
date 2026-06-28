#!/usr/bin/env python3
"""
Extract species data (catch rates, level-up moves, TM compatibility) 
from pokerogue source files into src/data/species-data.json.

Run from the pkr-manifest root directory:
  python3 scripts/extract-species.py
"""
import re, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PKR = os.path.join(ROOT, "pokerogue")
OUT = os.path.join(ROOT, "src", "data", "species-data.json")

def parse_enum(filepath, enum_name):
    with open(filepath) as f:
        content = f.read()
    m = re.search(rf'export enum {enum_name} \{{(.*?)\n\}}', content, re.DOTALL)
    if not m:
        print(f"ERROR: Could not find enum {enum_name} in {filepath}", file=sys.stderr)
        sys.exit(1)
    result, current = {}, 0
    for line in m.group(1).split('\n'):
        line = re.sub(r'/\*\*.*?\*/', '', line, flags=re.DOTALL)
        line = re.sub(r'//.*', '', line).strip().rstrip(',')
        if not line: continue
        explicit = re.match(r'(\w+)\s*=\s*(\d+)', line)
        if explicit:
            current = int(explicit.group(2))
            result[explicit.group(1)] = current
            current += 1
        else:
            nm = re.match(r'(\w+)', line)
            if nm:
                result[nm.group(1)] = current
                current += 1
    return result

print("Parsing enums...")
species_ids = parse_enum(os.path.join(PKR, "src/enums/species-id.ts"), "SpeciesId")
move_ids = parse_enum(os.path.join(PKR, "src/enums/move-id.ts"), "MoveId")
species_names = {v: k for k, v in species_ids.items()}
move_names = {v: k for k, v in move_ids.items()}
print(f"  Species: {len(species_ids)}, Moves: {len(move_ids)}")

gen_dir = os.path.join(PKR, "src/data/balance/species")
species_data = {}

print("Extracting species data...")
for gen_file in sorted(os.listdir(gen_dir)):
    if not gen_file.endswith('.ts'): continue
    with open(os.path.join(gen_dir, gen_file)) as f:
        content = f.read()
    pattern = re.compile(r'\w+SpeciesData\[SpeciesId\.(\w+)\]\s*=\s*\{')
    positions = [(m.group(1), m.start()) for m in pattern.finditer(content)]
    for idx, (sp_name, pos) in enumerate(positions):
        sp_id = species_ids.get(sp_name)
        if sp_id is None: continue
        end_pos = positions[idx+1][1] if idx+1 < len(positions) else len(content)
        block = content[pos:end_pos]
        cr_match = re.search(r'catchRate:\s*(\d+)', block)
        catch_rate = int(cr_match.group(1)) if cr_match else 45
        level_moves = []
        for lm in re.finditer(r'\[(\d+),\s*MoveId\.(\w+)\]', block):
            mv = move_ids.get(lm.group(2), 0)
            level_moves.append([int(lm.group(1)), mv])
        seen = set(); lm_dedup = []
        for lm in level_moves:
            k = tuple(lm)
            if k not in seen: seen.add(k); lm_dedup.append(lm)
        tms = []
        tms_match = re.search(r'\btms:\s*\[([^\]]*)\]', block, re.DOTALL)
        if tms_match:
            for tm in re.finditer(r'MoveId\.(\w+)', tms_match.group(1)):
                mv = move_ids.get(tm.group(1), 0)
                if mv and mv not in tms: tms.append(mv)
        species_data[sp_id] = {
            'name': sp_name,
            'catchRate': catch_rate,
            'legendary': bool(re.search(r'\blegendary:\s*true', block)),
            'subLegendary': bool(re.search(r'\bsubLegendary:\s*true', block)),
            'mythical': bool(re.search(r'\bmythical:\s*true', block)),
            'levelUpMoves': lm_dedup,
            'compatibleTms': tms,
        }

print(f"  Extracted {len(species_data)} species")

output = {
    'species': {str(k): v for k, v in species_data.items()},
    'moveNames': {str(k): v for k, v in move_names.items()},
    'speciesNames': {str(k): v for k, v in species_names.items()},
    'speciesIds': {k: v for k, v in species_ids.items()},
    'moveIds': {k: v for k, v in move_ids.items()},
}
with open(OUT, 'w') as f:
    json.dump(output, f)
print(f"Written to {OUT}")
