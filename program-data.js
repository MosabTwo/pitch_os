export const DAYS = [
  { key: 'mon', short: 'Mon', long: 'Monday', title: 'Strength A — Force', kind: 'Strength', desc: 'Power first, then unilateral strength, pulling, trunk control and shoulder durability.' },
  { key: 'tue', short: 'Tue', long: 'Tuesday', title: 'Throwing + tee', kind: 'Throw', desc: 'Pitching mechanics plus batting tee work. Throw first if lifting is paired with throwing.' },
  { key: 'wed', short: 'Wed', long: 'Wednesday', title: 'Strength B — Lateral', kind: 'Strength', desc: 'Lateral force, single-leg control, hamstrings, upper-body strength and trunk control.' },
  { key: 'thu', short: 'Thu', long: 'Thursday', title: 'Mobility + easy bike', kind: 'Recover', desc: 'Easy cycling plus mobility. Finish feeling better than you started.' },
  { key: 'fri', short: 'Fri', long: 'Friday', title: 'Strength C — Power', kind: 'Strength', desc: 'Explosive full-body work with single-leg strength, RDLs, pushing and controlled rotation.' },
  { key: 'sat', short: 'Sat', long: 'Saturday', title: 'Throwing + hitting', kind: 'Throw', desc: 'Second throwing exposure plus hitting.' },
  { key: 'sun', short: 'Sun', long: 'Sunday', title: 'Complete rest', kind: 'Rest', desc: 'No training target. Recover.' }
];

export const WARMUP = [
  ['Spin bike', '3 min easy', 'Warm up; do not turn this into conditioning.'],
  ['Knee-over-toe ankle rocks', '8 / side', 'Heel down. Drive the knee over the middle toes.'],
  ['90/90 hip switches', '6 / direction', 'Rotate through the hips instead of throwing the torso around.'],
  ['Adductor rock-back', '8 / side', 'Keep a neutral-ish spine. Move the hip back until the inner thigh loads.'],
  ['Open-book thoracic rotation', '6 / side', 'Rotate through the upper back. Do not fake rotation by arching the low back.'],
  ['Scapular push-up', '10', 'Elbows straight. Let the shoulder blades move around the ribcage.'],
  ['Bodyweight split squat', '5 / side', 'Controlled, deep repetitions.']
];

function ex(name, volume, rest, sets, cue, note = '') {
  return { name, volume, rest, sets, cue, note };
}

export const WORKOUTS = {
  mon: {
    title: 'Monday — Strength A', badge: 'Force', subtitle: '60–75 min. Explosive work first, then strength.', warmup: true,
    exercises: [
      ex('Standing broad jump', '4 × 2', '60–90 sec', 4, 'Start athletic, load the hips, swing the arms and explode forward. Land quietly with knees tracking the feet. Hold the landing.', 'Do not turn 4 × 2 into 4 × 10. Stop if jump quality drops.'),
      ex('Bulgarian split squat', '4 × 6–10 / leg', '2–3 min', 4, 'Rear foot on the bench. Keep the whole front foot connected. Descend down, then push the floor away. Let the front knee travel forward naturally.', 'Once 2 × 12.5 kg × 10 × 4 is comfortable with about two reps left, add load, range, a 3-second descent or a 1-second pause.'),
      ex('Pull-up', '4 × 4–8', '2–3 min', 4, 'Start from a controlled hang. Keep the ribs controlled. Drive the elbows toward the sides and bring the upper chest toward the bar. Lower under control.', 'At 8 / 8 / 8 / 8, add secure backpack resistance.'),
      ex('Single-leg Romanian deadlift', '3 × 8–12 / leg', '2 min', 3, 'Think hips back → torso forward. The back leg reaches behind as a counterbalance. Keep the hips reasonably square.', 'Use about a 3-second descent. Hamstrings and glute should work harder than the low back.'),
      ex('One-arm dumbbell bench press', '3 × 8–12 / arm', '90 sec', 3, 'Feet planted. Keep the forearm reasonably vertical. Do not let the dumbbell rotate your torso off the bench.', 'Unilateral pressing forces the trunk to resist rotation while producing force.'),
      ex('Copenhagen plank', '3 × 20–30 sec / side', '60–90 sec', 3, 'Stay long and keep the pelvis from sagging.', 'Adductor plus trunk work.'),
      ex('Side-lying shoulder external rotation', '2 × 12–20 / side', '60 sec', 2, 'Use a very light dumbbell. Keep the elbow near your side and rotate under control.', 'This is not an ego exercise. A 12.5 kg dumbbell does not belong here.')
    ]
  },
  wed: {
    title: 'Wednesday — Strength B', badge: 'Lateral', subtitle: 'Lateral force, hamstrings and single-leg control.', warmup: true,
    exercises: [
      ex('Lateral bound + stick', '4 × 3 / direction', '60–120 sec', 4, 'Jump sideways, land on the opposite leg and own the position for about one second before repeating.', 'Train force production and force absorption.'),
      ex('Front-foot-elevated split squat', '4 × 8–12 / leg', '2–3 min', 4, 'Use a small stable elevation. Keep the whole front foot planted, drop mostly vertically, allow the knee forward and get genuinely deep under control.', 'Pause one second at the bottom. Strength and useful mobility at the same time.'),
      ex('Dips', '4 × 5–10', '2–3 min', 4, 'Start tall with a slight forward torso angle. Lower under control and press aggressively.', 'If extreme depth causes anterior shoulder discomfort, do not chase it. Add backpack load at 4 × 10.'),
      ex('One-arm dumbbell row', '4 × 8–15 / side', '60–90 sec', 4, 'Support yourself on the bench. Reach slightly at the bottom. Pull the elbow toward the hip and let the shoulder blade move.', 'Do not rotate the whole torso just to create more dumbbell travel.'),
      ex('Hamstring floor sliders', '3 × 6–12', '90 sec', 3, 'Start in a bridge, extend the legs slowly and pull them back underneath you.', 'When normal repetitions get easy: extend with two legs, return with one.'),
      ex('Single-leg calf raise', '3 × 12–20 / leg', '60–90 sec', 3, 'Use a full stretch at the bottom, drive up, pause and control down.', 'The ankle has to produce and transmit force.'),
      ex('Dead bug', '3 × 6–10 / side', '60 sec', 3, 'Move slowly, exhale and keep the ribs controlled while the opposite arm and leg extend.', 'Do not let the lower back aggressively arch.'),
      ex('Prone Y raise', '2 × 10–15', '60 sec', 2, 'Start with no weight or an extremely light load. Reach the arms diagonally overhead.', 'Think long arms, not shrug shoulders.')
    ]
  },
  fri: {
    title: 'Friday — Strength C', badge: 'Power', subtitle: 'Athletic full-body day with explosive work first.', warmup: true,
    exercises: [
      ex('Countermovement jump', '4 × 3', '60–90 sec', 4, 'Stand tall, drop rapidly, reverse immediately and jump as high as possible. Land under control.', 'This is not conditioning. Every repetition should look athletic.'),
      ex('Single-leg squat to bench', '4 × 6–10 / leg', '2–3 min', 4, 'Stand on one leg, lower under control, touch the bench lightly and stand without fully sitting and relaxing.', 'A higher bench is easier. A lower target, then added load, makes it harder.'),
      ex('Chin-up', '4 × 4–8', '2–3 min', 4, 'Palms toward you. Use a controlled hang, a strong pull and controlled lowering.', 'At 4 × 8, add resistance.'),
      ex('Barbell Romanian deadlift', '3 × 8–12', '2–3 min', 3, 'Use soft knees, brace and push the hips back while keeping the bar close. Stop when the hamstrings limit further hip movement.', 'Do not chase the floor. If 30 kg is too easy, use B-stance or single-leg RDLs rather than 30 repetitions.'),
      ex('Feet-elevated push-up', '4 × 8–15', '90 sec', 4, 'Feet on the bench. Keep the body rigid, lower the chest and press aggressively while allowing the shoulder blades to move.', 'At 15 easy repetitions, add a securely loaded backpack.'),
      ex('Cossack squat', '3 × 6 / direction', '60–90 sec', 3, 'Use a wide stance. Shift over one hip, keep the working foot planted and the opposite leg long.', 'Build controlled depth over time rather than forcing range.'),
      ex('Side plank + reach', '3 × 8 / side', '60–90 sec', 3, 'Build a strong side plank, reach the top arm underneath, rotate through the torso and return under control.', 'Do not rush.')
    ]
  },
  thu: {
    title: 'Thursday — Mobility + Recovery', badge: 'Recover', subtitle: 'Easy aerobic work and mobility. This should not become another workout.', warmup: false,
    exercises: [
      ex('Spin bike', '25–35 min easy', 'Conversational', 0, 'Keep the effort easy enough to hold a conversation.', 'Recovery, not conditioning.'),
      ex('Knee-to-wall ankle', '2 × 8 / side', 'Easy', 2, 'Keep the heel down and move through controlled ankle range.'),
      ex('90/90 hip switches', '2 × 6 / side', 'Easy', 2, 'Own the hip rotation instead of throwing the torso around.'),
      ex('Cossack squat', '2 × 6 / side', 'Easy', 2, 'Use the depth you can control.'),
      ex('Adductor rock-back', '2 × 8 / side', 'Easy', 2, 'Move the hip back and load the inner thigh.'),
      ex('Half-kneeling hip-flexor stretch', '2 × 30 sec / side', 'Easy', 2, 'Keep the ribcage and pelvis controlled rather than leaning into lumbar extension.'),
      ex('Open-book rotation', '2 × 6 / side', 'Easy', 2, 'Rotate through the upper back.'),
      ex('Scapular push-up', '2 × 10', 'Easy', 2, 'Keep the elbows straight and move the shoulder blades around the ribcage.'),
      ex('Controlled shoulder circles', '5 / direction', 'Easy', 0, 'Move slowly through a pain-free controlled range.', 'Finish feeling better than you started.')
    ]
  }
};

export const TRAINING_RULES = [
  ['Most strength work: RPE 7–9', 'Finish most working sets with roughly 1–3 good repetitions still available. Constant failure training is not the goal.'],
  ['Jumps and bounds: 60–120 sec rest', 'Rest enough to keep every repetition explosive. Stop the set if output clearly drops.'],
  ['Big strength exercises: 2–3 min rest', 'Split squats, pull-ups, dips, RDLs and single-leg squats need real recovery between sets.'],
  ['Smaller work: 60–90 sec rest', 'Rows, shoulder work, core and calves can move faster without turning the session into conditioning.'],
  ['Progression hierarchy', 'Add weight → make it unilateral → increase range → add a pause → slow the eccentric. Do not solve every loading problem with 30–50 repetitions.']
];

export const EQUIPMENT = [
  ['Resistance bands', 'Rotator-cuff work, scapular work, Pallof presses, face pulls and warm-ups.'],
  ['More load', 'Heavier adjustable dumbbells or more barbell weight for lower-body strength.'],
  ['2–4 kg medicine ball', 'Rotational power, step-behind throws, scoop tosses and shot-put variations.'],
  ['Season adjustment', 'When throwing volume rises, trim sets before replacing useful exercises.']
];
