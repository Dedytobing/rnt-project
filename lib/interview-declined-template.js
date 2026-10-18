export const DECLINED_REASON_OPTIONS = [
  { id: 'ooc-age', label: 'OOC Info (Under 17)', text: 'Out Of Character Information (RL Age under 17)' },
  { id: 'below-passing-grade', label: 'Below Passing Grade', text: 'Interview score below the minimum passing grade' },
  { id: 'expired-application', label: 'Expired Application / Late Apply', text: 'Application submitted after the recruitment registration deadline' },
  { id: 'expired-revision', label: 'Expired Revision Time / Late Revision', text: 'Failed to provide required application updates within the allocated time' },
  { id: 'criminal-records', label: 'Criminal Records', text: 'Does not meet qualification standards due to active or disqualifying criminal records' },
  { id: 'general-qualification', label: 'General Qualification', text: 'Does not meet the current qualification standards required for Law Enforcement Officer (LEO)' },
];

export function createDeclinedBbcode(candidate, reason, staffProfile) {
  const departmentNames = {
    LSSD: "Los Santos Sheriff's Department",
    LSPD: 'Los Santos Police Department',
    SASP: 'San Andreas State Police',
    DOC: 'Department of Corrections',
  };
  const officerDepartment = departmentNames[staffProfile.department] || staffProfile.department;
  const signature = [
    staffProfile.name,
    staffProfile.rank,
    staffProfile.position,
    officerDepartment,
  ]
    .filter(Boolean).join('\n');

  return `[divbox=white][center][img]https://imagizer.imageshack.com/v2/200x200q70/924/Rs1Hi8.png[/img][img]https://imagizer.imageshack.com/img924/9329/WjRSSl.png[/img][img]https://imageshack.com/i/pogQ42LOp[/img][/center]
[center][size=200][b]LAW ENFORCEMENT OFFICER[/b][/size][/center]
[center][size=100][b]Recruitment and Training Divison[/b][/size][/center]
[divbox=darkblue][/divbox]
Dear Mr. ${candidate.nama},

Thank you for participating in the interview stage of the Law Enforcement Officer recruitment process. We appreciate the time and effort you put into your application and your interest in serving the city of Los Santos.

After careful consideration and evaluation of your interview performance, we regret to inform you that your application has been [b][color=#BF0000]DECLINED[/color][/b] at this stage. Unfortunately, your responses did not meet the standards or expectations required to proceed to the academy.

[tab][b]REASON: ${reason}[/b]

Please do not be discouraged. You are welcome to reapply in the next recruitment batch, and we encourage you to take this time to reflect, improve, and better prepare for the next opportunity.

If you would like general feedback or have any questions regarding this outcome, feel free to contact a Recruitment Officer or visit us directly at [b]Alta Station HQ.[/b]

We thank you once again for your interest in joining the department, and we wish you success in your future endeavors.


[right]Sincerely,
${signature || 'Recruitment Staff'}[/right]
[/divbox]`;
}
