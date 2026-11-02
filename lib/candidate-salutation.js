export function candidateSalutation(candidate) {
  return String(candidate?.gender || '').trim().toLocaleLowerCase('id-ID') === 'female' ? 'Ms.' : 'Mr.';
}
