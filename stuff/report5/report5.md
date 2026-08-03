Report 5 Test Documentation.docx
CAPSTONE PROJECT REPORT
Report 5 – Software Test Documentation
Table of Contents
I. Record of Changes	
II. Testing Documentation	
1. Scope of Testing	
1.1 Testing Scope	
1.1.1 In-Scope Testing	
1.1.2 Out-of-Scope Testing	
1.2 Testing Levels	
1.2.1 Unit Testing	
1.2.2 Integration Testing	
1.3 Testing Constraints and Assumptions	
Assumptions	
Constraints	
2. Test Strategy	
2.1 Testing Types	
2.1.1 Functional Testing	
2.1.2 Integration Testing	
2.1.3 User Acceptance Testing (UAT)	
2.1.4 Non-Functional Testing	
2.2 Test Levels	
2.3 Supporting Tools	
3. Test Plan	
3.1 Human Resources	
3.2 Test Environment	
3.3 Test Milestones	
4. Test Cases	
5. Test Reports	
5.1 Test Execution Summary	
5.2 Defect Summary	
5.3 Test Analysis	
5.4 Test Conclusion	
I. Record of Changes
II. Testing Documentation
1. Scope of Testing
[Describe the scopes of the test. Those include the target-of-test’s features, functions, and non-functional requirements that will or will not be tested.
Describe the stages/levels of testing that would be applied to your project - Unit, Integration, or System test. Each includes the in-charge, inputs/time, focuses, acceptance criteria.
List any constraints or assumptions made during the development of this document that may impact the design, development or implementation of testing]
<<Sample: 
1.1 Testing Scope
1.1.1 In-Scope Testing
The following features and functions are included in the testing scope:
User authentication functions (Login, Register, Logout)
Book browsing and viewing book details
Shopping cart management (add, update, remove items)
Order processing (checkout, place order)
Online payment processing via external payment gateway
Viewing order history
Administrative functions such as managing books and managing orders
Non-functional requirements including usability, performance, reliability, and security
1.1.2 Out-of-Scope Testing
The following items are excluded from the testing scope:
Performance testing of external payment gateway services
Hardware stress testing on production servers
Testing of third-party services not directly controlled by the project team
Compatibility testing on obsolete or unsupported web browsers
1.2 Testing Levels
Testing activities are conducted at multiple levels to ensure software quality and correctness.
1.2.1 Unit Testing
In-charge: Developers
Input / Time: Source code modules during implementation phase
Focus:
Individual functions and methods
Business logic such as cart calculation, order total calculation


Acceptance Criteria:
All unit test cases pass successfully
No critical defects detected at unit level
1.2.2 Integration Testing
In-charge: Development team and testers
Input / Time: Integrated modules after unit testing
Focus:
Interaction between modules (Cart → Order → Payment)
Data flow between system components
Acceptance Criteria:
Data is passed correctly between modules
Integrated functions work as expected without errors
1.3 Testing Constraints and Assumptions
Assumptions
Test requirements are based on the approved Software Requirement Specification (Report 3).
The test environment closely resembles the production environment.
External payment gateway provides a sandbox environment for testing purposes.
Constraints
Limited testing time due to fixed project schedule.
Testing depends on the availability and stability of third-party payment gateway services.
Performance testing is limited to simulated load conditions within available resources.
>>
2. Test Strategy
[List out and describe all testing types (you can refer the test types listed below or any other test types to selected the suitable ones for the project; for each selected test types you need to provide the following information: test objective, technique, completion criteria, etc.), test levels that those test types would be performed, & the details of test supporting tools would be used in the project]
2.1 Testing Types
[List out and describe here the testing types which you would apply in your project. You need to mention following information for each type of testing: objective, technique, completion criteria]
<<Sample: 
2.1.1 Functional Testing
Objective:
To verify that the system functions operate according to the specified requirements.
Technique:
Black-box testing based on use cases and functional requirements.
Completion Criteria:
All functional test cases are executed and passed with no critical defects remaining.
2.1.2 Integration Testing
Objective:
To verify correct interaction and data flow between integrated modules.
Technique:
Incremental integration testing.
Completion Criteria:
All integrated components communicate correctly without data loss or processing errors.
2.1.3 User Acceptance Testing (UAT)
Objective:
To confirm that the system satisfies user expectations and business needs.
Technique:
Scenario-based testing performed by end users.
Completion Criteria:
Key business workflows are approved by stakeholders.
2.1.4 Non-Functional Testing
Objective:
To evaluate non-functional requirements such as usability, performance, reliability, and security.
Technique:
Manual testing and basic performance testing tools.
Completion Criteria:
System meets defined non-functional benchmarks with no major violations.
>>
2.2 Test Levels
<List out and describe here the testing levels which you would execute in your project. Besides, clearly state the test types which are performed in each test level that you plan for this project>
Type of Tests		Test Level
		Unit	Integration	System	Acceptance
Functional Testing
Integration Testing
System Testing
User Acceptance Testing
Non-Functional Testing

2.3 Supporting Tools
<List of the test supporting tools which will be employed for this project>
<<Sample: 
Purpose Tool Vendor/In-house Version
Unit Testing JUnit Open-source 5.x 
API Testing Postman Open-source Latest
Test Case Management Microsoft Excel Microsoft Office 365 
Bug Tracking GitHub Issues GitHub Latest 
Performance Testing Apache JMeter Apache 5.x 
Browser Testing Google Chrome Google Latest

>>

3. Test Plan
3.1 Human Resources
[List and provide the details on roles and responsibilities of the project members who would involve in testing works, in the table format as below]
<<Sample: 
Worker/Doer Role Specific Responsibilities/Comments
Tester 1 Test Leader Plans testing activities, prepares test strategy, coordinates testing tasks, and reports testing status.
Tester 2 Functional Tester Designs and executes functional test cases for core features such as login, cart, and order processing.
Tester 3 Integration Tester Performs integration testing between system modules (Cart, Order, Payment).
Developer 1 Developer Fixes defects reported by testers and supports unit testing activities.
Developer 2 Developer Supports integration testing and resolves defects related to database and business logic.
Product Owner Reviewer Reviews test results and confirms whether the system meets acceptance criteria.

>>

3.2 Test Environment
[List and provide the details about the tools (software, hardware, infrastructure) which the project would use for testing. The information can be provided in the table format as below]
<<Sample: 
Purpose Tool Provider Version
Operating System Windows 10 Microsoft 22H2
Web Browser Google Chrome Google Latest
Backend Runtime Java JDK Oracle 17
Database MySQL Oracle 8
IDE IntelliJ IDEA JetBrains 2023.x
API Testing Postman Open-source Latest
Performance Testing Apache JMeter Apache 5.x
Bug Tracking GitHub Issues GitHub Latest 
Test Case Management Microsoft Excel Microsoft Office 365

>>

3.3 Test Milestones
[Separate test milestones, which should be identified to communicate project status accomplishments. The information can be provided in the table format as below]
<<Sample: 
Milestone Task Start Date End Date
Test Planning 1/5/2026 3/5/2026
Unit Testing 4/5/2026 10/05/2026
Integration Testing 11/05/2026 17/05/2026
System Testing 18/05/2026 24/05/2026
User Acceptance Testing 25/05/2026 28/05/2026
Test Closure & Reporting 29/05/2026 30/05/2026

>>

4. Test Cases
[Prepare the details on the test cases following the provided template
Unit Test Cases: Report5_Unit Test.xls
Other Test Cases (IT, ST, AT): Report5_Test Report.xls]
<<Sample: 
The detailed unit test cases are provided in the file Report5_Unit Test.xls.
>>
5. Test Reports
[Provide the test result, statistics and the relevant test analysis for your testing in the project]
<<Sample: 
5.1 Test Execution Summary
Test Type Total Test Cases Passed Failed Pass Rate
Unit Testing 20 20 0 100%
Integration Testing 12 11 1 91.7%
System Testing 15 15 0 100%
Acceptance Testing 6 6 0 100%

5.2 Defect Summary
Severity Number of Defects Description
Critical 0 No system crash or data loss
Major 1 Payment timeout in integration test
Minor 2 UI alignment issues

5.3 Test Analysis
Most defects were detected during integration testing, especially in payment processing.
No critical defects were found during system and acceptance testing.
All major defects were fixed and retested successfully.
The system meets the defined acceptance criteria and is ready for release.
5.4 Test Conclusion
Based on the test results, the Book Store system satisfies the functional and non-functional requirements specified in the Software Requirement Specification.
 The system is considered stable and acceptable for deployment.
>>



Report5_Test Report.xlsx

Cover Sheet
Project Name	<Project Name>			Creator	
Project Code	<Project Code>			Issue Date	<Date when this test report is created>
Document Code	<Project Code>_XXX_vx.x			Version	
Record of change					
Effective Date	Version	Change Item	*A,D,M	Change description	Reference
<Date when these changes are effective>					<List of documents which are refered in this version.>

Test Cases Sheet
TEST CASE LIST 
Project Name		#REF!		
Project Code		#REF!		
Test Environment Setup Description		"<List enviroment requires in this system 1. Server 2. Database 3. Web Browser...>"		
No	Function Name	Sheet Name	Description	Pre-Condition
1	Function A	Feature1		
2	Function B	Feature1		
3	Function C	Feature1		
4	Function D	Feature2		
5	Function E	Feature2		

TEST STATISTICS Sheet
Project Name	<Project Name>		Creator			
Project Code	<Project Code>		Reviewer/Approver			
Document Code	<Project Code>_Test Report_vx.x		Issue Date			<Date when this test report is created>
Notes	<List modules included in this release> ex: Release 1 includes 2 modules: Module1 and Module2					
No	Module code	Passed	Failed	Pending	N/A	Number of  test cases
1	<Feature Name1>	0	0	6	0	8
2	<Feature Name2>	0	0	5	0	7
						
	Sub total	0	0	11	0	15
						
	Test coverage		0.00	%		
	Test successful coverage		0.00	%		

Feature 1 Sheet
Feature	<Feature Name1>			
Test requirement	<Brief description about requirements which are tested in this sheet>			
Number of TCs	8			
Testing Round	Passed	Failed	Pending	N/A
Round 1	0	0	6	0
Round 2	0	0	6	0
Round 3	0	0	6	0

Test Case ID	Test Case Description	Test Case Procedure	Expected Results	Pre-conditions	Round 1	Test date	Tester	Round 2	Test date	Tester	Round 3	Test date	Tester	Note
Function A														
<ID1>	"<Brief description of this case: what is tested?>
Ex: Test viewing ""Company"" form."	"<Describe steps to perform this case>
Ex:
1. Login the system with Manager role.
2. Click ""Company"" tab in the left menu."	"<Describe results which meet customer's requirement>
Ex:
The ""Company"" view form is displayed with the folowing informations:
- Company name
- Company address
- Phone
- Fax"	"<List all test cases or conditions that must be done before performing this case>
"	Pending			Pending			Pending			
<ID2>	<Test case 2>				Pending			Pending			Pending			
<ID3>	<Test case 3>				Pending			Pending			Pending			
Function B														
<ID4>	<Test case 4>				Pending			Pending			Pending			
<ID5>	<Test case 5>				Pending			Pending			Pending			
Function C														
<ID6>	<Test case 6>				Pending			Pending			Pending			


Report 5_Unit Test.xls
Cover Sheet
Project Name	<Project Name>			Creator	
Project Code	<Project Code>			Issue Date	<Date when this test report is created>
Document Code	<Project Code>_XXX_vx.x			Version	
Record of change					
Effective Date	Version	Change Item	*A,D,M	Change description	Reference
<Date when these changes are effective>					<List of documents which are refered in this version.>

Functions Sheet
Project Name				<Project Name>			
Project Code				<Project Code>			
Normal number of Test cases/KLOC 				100			
Test Environment Setup Description				"<List enviroment requires in this system 1. Server 2. Database 3. Web Browser … >"	

No	"Requirement
Name"	Class Name	Function Name	 Function Code(Optional)	Sheet Name	Description	Pre-Condition
1		Class1	Function A	Function1	Function1		
2		Class2	Function B	Function2	Function2		
3		Class3	Function C	Function3	Function3		

Statistics Sheet
UNIT TEST REPORT
Project Name	<Project Name>		Creator					
Project Code	<Project Code>		Reviewer/Approver					
Document Code	<Project Code>_Test Report_vx.x		Issue Date		<Date when this test report is created>			
Notes	<List modules included in this release> ex: Release 1 includes 2 modules: Module1 and Module2							
		
No	Function code	Passed	Failed	Untested	N	A	B	Total Test Cases
1	Function1	12	2	1	11	3	1	15
2	Function2	12	3	0	12	2	1	15
3	Function3	12	2	1	12	2	1	15

	Sub total	36	7	2	35	7	3	45
								
	Test coverage		95.56	%				
	Test successful coverage		80.00	%				
	Normal case		77.78	%				
	Abnormal case		15.56	%				
	Boundary case		6.67	%				


Function 1 Sheet
																			
Function Code		Function1			Function Name						Function A								
Created By		<Developer Name>			Executed By														
Lines  of code		100			Lack of test cases						-5								
Test requirement		<Brief description about requirements which are tested in this function>																	
Passed		Failed			Untested						N/A/B			Total Test Cases					
12		2			1						11	3	1	15					
					UTCID01	UTCID02	UTCID03	UTCID04	UTCID05	UTCID06	UTCID07	UTCID08	UTCID09	UTCID10	UTCID11	UTCID12	UTCID13	UTCID14	UTCID15
Condition	Precondition 																		
			Can connect with server																
																			
																			
	Date																		
			29		O	O													
			30																
			31																
	Month																		
			2		O														
			3			O													
			4																
	Year																		
			2000		O														
			2009			O													
																			
																			
																			
																			
																			
																			
Confirm	Return																		
			T		O	O													
			F																
	Exception																		
																			
	Log message																		
			"success"																
			"input1 is null"																
Result	Type(N : Normal, A : Abnormal, B : Boundary)				A	N	N	N	N	B	A	N	N	N	N	N	A	N	N
	Passed/Failed				P	P	P	P	P	F	F	P	P	P	P	P		P	P
	Executed Date				02/26	02/26	02/27	02/28	03/01	03/02	03/03	03/04	03/05	03/06	03/07	03/08	03/09	03/10	03/11
	Defect ID									DFID002	DFID004	DFID005	DFID006	DFID007	DFID008	DFID009	DFID010	DFID011	DFID012

