# 대시보드 설계 근거

치료사·환자 대시보드에 무엇을 넣을지 정하기 위해 작업치료 사례 관리 도구, 원격 치료 모니터링(RTM)과 가정 운동(HEP) 플랫폼, 뇌졸중 재활 앱 연구를 조사했습니다.

## 1. 조사에서 반복해서 나온 정보

| 분야 | 자주 다루는 정보 | 출처 |
|---|---|---|
| 작업치료 사례 관리 | 치료 일정·시간, 재평가 날짜 같은 기한, 목표 영역, 목표별 측정값을 표와 그래프로 보며 진전 판단 | [Tools To Grow – Caseload Management](https://www.toolstogrowot.com/therapy-resources/caseload-management), [Twinkl OT Caseload Overview](https://www.twinkl.com/resource/occupational-therapy-caseload-overview-editable-google-sheets-us-se-1761918960) |
| 치료 기관 운영 | 치료 완료율, 결석·일정 준수 | [OT Dashboard in Power BI](https://www.pk-anexcelexpert.com/occupational-therapy-dashboard-in-power-bi/) |
| 원격 치료 모니터링 | 환자가 앱에서 운동을 하고 통증·난이도를 기록하면 수행률이 치료사 화면에 실시간으로 반영됨, 한눈에 보는 수행 현황 화면 | [Physitrack](https://www.physitrack.com/), [Exercise Pro Live RTM](https://www.exerciseprolive.com/remote-therapeutic-monitoring-software/), [Limber Health](https://www.limberhealth.com/for-providers/remote-therapeutic-monitoring) |
| 뇌졸중 가정 재활 앱 | 처방 받기, 활동 기록, 진행 확인, 교육 자료, 보호자가 주 사용자가 되는 경우 지원, 치료사 일정 관리 | [mHealth Apps for Family Caregivers of Stroke Patients](https://pmc.ncbi.nlm.nih.gov/articles/PMC12675943/), [Scoping review: apps for stroke rehabilitation](https://pmc.ncbi.nlm.nih.gov/articles/PMC10348057/), [Digital patient portal for stroke self-management](https://link.springer.com/article/10.1007/s41666-026-00253-9) |

## 2. 치료사 대시보드에 넣은 것

| 화면 요소 | 이유 |
|---|---|
| 요약 타일: 오늘 치료(완료/예정), 확인 필요(위험·주의), 새 메시지, 담당 환자(앱 가입 수) | 출근해서 가장 먼저 확인하는 네 가지 |
| 오늘 일정: 완료·결석·취소 표시, 완료 후 바로 SOAP 쓰기 | 일정 관리와 기록 누락 방지를 한 흐름으로 |
| 확인이 필요한 환자: AI 자동 검진 결과를 위험 → 주의 → 정보 순으로 | 통증 급증, 낮은 수행률, 결석, 기록 공백을 놓치지 않게 |
| 다가오는 기한(2주): 목표 기한, 재평가 일정 | 사례 관리 도구에서 공통으로 추적하는 날짜 |
| 이번 주 일정 | 주간 계획 |
| 환자 현황 표: 운동 수행률, 통증 추이, 평가 점수와 변화, 달성 목표, 마지막 SOAP, 다음 치료, 새 메시지 | RTM 플랫폼의 "한눈에 보기" 화면 |
| 환자별 "일정·컨디션" 탭: 일정 추가·관리, 통증 추이 그래프, 컨디션 기록 표 | 환자가 집에서 남긴 기록을 치료 판단에 사용 |

## 3. 환자·보호자 대시보드에 넣은 것

| 화면 요소 | 이유 |
|---|---|
| 다음 치료 (날짜, 종류, D-day) | 일정 알림은 재활 앱의 기본 기능 |
| 오늘 운동 진행률과 바로 가기 | 처방받은 운동을 매일 실천하게 |
| 꾸준함: 연속 일수, 이번 주 수행률 | 동기 부여, 수행률이 치료 효과와 연결 |
| 오늘 컨디션: 통증·피로·기분·수면·메모 | 환자 보고 결과(PRO)를 치료사가 추이로 봄. 통증 6 이상이면 치료사에게 자동 알림 |
| 지금 목표 (쉬운 말), 달성한 목표 수 | 목표를 이해해야 참여도가 올라감 |
| 새 메시지 알림 | 치료사와의 소통 |
| 보호자 가입과 보호자용 인사말 | 환자가 직접 쓰기 어려운 경우 보호자가 주 사용자 |
| 내 기록: 일상생활 점수 그래프, 통증 그래프, 최근 치료사 평가, 지난 치료 | 진행을 눈으로 확인 |

## 4. 아직 넣지 않은 것 (다음 단계 후보)

- 운동 동작 영상·그림 안내와 교육 자료
- 알림(카카오 알림톡·푸시)으로 운동·치료 일정 알려 주기
- 한 환자에 보호자와 환자 본인 두 계정 연결 (지금은 한 계정만)
- 표준화된 환자 보고 설문(PROMs)과 기관 단위 통계(치료 완료율 등)
- 운동 난이도 평가, 카메라 측정 동작 종류 확대
