# @chialab/speaker

## 3.2.1

### Patch Changes

- 63dddd8: Add headings to block tags list.

## 3.2.0

### Minor Changes

- 2a7e4d4: Set default block types.

### Patch Changes

- 3808c8b: accept sentence end regexp as option

## 3.1.1

### Patch Changes

- 7ef07fa: Only check for offset parent.

## 3.1.0

### Minor Changes

- 30de9c3: Add support for inputs and textareas.

## 3.0.1

### Patch Changes

- 1af4ba6: Support generic `Element`s.

## 3.0.0

### Major Changes

- e242595: Use CSS highlights.

### Minor Changes

- 9d4ede3: Add `rewind` and `forward` methods.
- adb1850: Fix tokenization of selected ranges.

### Patch Changes

- 2e08e5f: Correctly check if element is part of a range when it preceeds and contains the range.
- 311c3fb: Allow custom regexp to check sentence ending.
- 8634b82: Fix absolute positioned elements.
- 86895b6: Support voice quality and type.
- 338f5ed: added check for void lang attribute for tokens
- 473ceda: Do not asynchronously load voice definitions to avoid loading issues with iOS Safari.
- 5d014ef: Avoid empty string lang
- 8a20d49: Handle inline elements inside SVG.

## 3.0.0-beta.9

### Patch Changes

- 473ceda: Do not asynchronously load voice definitions to avoid loading issues with iOS Safari.

## 3.0.0-beta.8

### Patch Changes

- 338f5ed: added check for void lang attribute for tokens

## 3.0.0-beta.7

### Patch Changes

- 5d014ef: Avoid empty string lang

## 3.0.0-beta.6

### Minor Changes

- 9d4ede3: Add `rewind` and `forward` methods.

## 3.0.0-beta.5

### Patch Changes

- 86895b6: Support voice quality and type.

## 3.0.0-beta.4

### Patch Changes

- 8634b82: Fix absolute positioned elements.

## 3.0.0-beta.3

### Patch Changes

- 8a20d49: Handle inline elements inside SVG.

## 3.0.0-beta.2

### Patch Changes

- 2e08e5f: Correctly check if element is part of a range when it preceeds and contains the range.
- 311c3fb: Allow custom regexp to check sentence ending.

## 3.0.0-beta.1

### Minor Changes

- adb1850: Fix tokenization of selected ranges.

## 3.0.0-beta.0

### Major Changes

- e242595: Use CSS highlights.

## 2.0.3

### Patch Changes

- 3d55884: Support `bundler` module resolution.

## 2.0.2

### Patch Changes

- 7a8a6a3: Stabilize utterance state

## 2.0.1

### Patch Changes

- 0ab04c0: Fixed a problem with speechSynthesis state.

## 2.0.0

### Major Changes

- 61ca9e3: Use a more performant builtin tokenizer for text2speech.
