# Design Draft

## 1. Feature List

- NFC Check-in (individual and group)
- NFC Check-out (individual and group)
- Group Formation (customers can join an existing checked-in group)
- Session Tracking
- Active Customer Monitoring (staff web view of who is currently scanning, per table)
- 3D-Printed Product Display

## 2. User Journey

### 2.1 Check-in — solo customer, group forms upfront

1. Customer A enters the café and receives an NFC tag.
2. Customer A scans the tag to check in.
3. The group waits until every friend has scanned in.
4. Once everyone has checked in, the group starts playing.

### 2.2 Check-in — customer joins a group already playing

1. Customer A enters the café, receives an NFC tag, scans in, and starts playing.
2. Customer B arrives later and wants to join Customer A's table.
3. Customer A scans their tag again; the hardware reader shows the group screen.
4. Customer B receives an NFC tag and scans it on the same reader.
5. Customer A and Customer B are now in the same group/session.

### 2.3 Check-out — individual

1. Customer A scans their NFC tag. The hardware shows the group screen, and the staff admin web
   view shows which table is currently scanning, with an indicator for who is scanning.
2. Staff tell Customer A their individual price.
3. Customer A pays.
4. Staff click check-out to remove Customer A's NFC tag from the system (the rest of the group is
   unaffected).

### 2.4 Check-out — whole group

1. Customer A scans their NFC tag. The hardware shows the group screen, and the staff admin web
   view shows which table is currently scanning, with an indicator for who is scanning.
2. Staff tell Customer A the overall group price.
3. Customer A pays for the whole group.
4. Staff click group check-out to close out every member of the group at once.

## 3. Prototype

[[prototype NFC Check-in Check-out](https://nfc-boardgame-checkin-demo.netlify.app/?fbclid=IwY2xjawUGCo1wZG9mBWV4dG4DYWVtAjEwAGJyaWQRMU9JbXFLWUxEbDV4MTNPRHhzcnRjBmFwcF9pZBAyMjIwMzkxNzg4MjAwODkyAAEeNbLfcFvwOo2do7Y8ZKLrcExei3-XCwiltjQm9_psq-KJT9H-AY3W85_QBK0_aem_e89gmUppKcviwS1fkkfMcw)]

## 4. Diagrams

> Diagrams are plain-text [Mermaid](https://mermaid.js.org/) so they can be edited directly in this
> file (GitHub renders them inline). No image files to regenerate.

### 4.1 Use Case Diagram

```mermaid
flowchart LR
    Customer(["👤 Customer"])
    Staff(["👤 Staff"])

    subgraph SYS["NFC-Based Check-in / Check-out System"]
        UC1(["Check-in — start a group"])
        UC2(["Check-in — join existing group"])
        UC3(["Check-out — individual member"])
        UC4(["Check-out — whole group"])
        UC5(["View active tables & sessions"])
        UC6(["Validate NFC Tag"])
        UC7(["Record Session"])
        UC8(["Manage Group Membership"])
    end

    Customer --> UC1
    Customer --> UC2
    Customer --> UC3
    Customer --> UC4
    Staff --> UC3
    Staff --> UC4
    Staff --> UC5

    UC1 -. include .-> UC6
    UC1 -. include .-> UC7
    UC2 -. include .-> UC6
    UC2 -. include .-> UC8
    UC3 -. include .-> UC6
    UC3 -. include .-> UC8
    UC4 -. include .-> UC6
    UC4 -. include .-> UC8
```

### 4.2 Activity Diagram

**Check-in** (solo start, or joining a group already playing):

```mermaid
flowchart TD
    Start([Start]) --> Enter[Enter café / receive NFC tag]
    Enter --> Scan[Scan NFC tag on reader]
    Scan --> Validate[Validate NFC tag]
    Validate --> ValidCheck{Valid tag?}
    ValidCheck -- No --> TryAgain[Try again] --> Scan
    ValidCheck -- Yes --> TableCheck{Active group\nalready at this table?}
    TableCheck -- No --> NewGroup[Create new group + session\nsave check-in time]
    NewGroup --> WaitFriends{More friends\nstill joining?}
    WaitFriends -- Yes --> Scan
    WaitFriends -- No --> StartPlay[Group starts playing]
    StartPlay --> End1([End])
    TableCheck -- Yes --> ShowGroupScreen[Hardware shows group screen]
    ShowGroupScreen --> AddMember[Add member to group\nsave check-in time]
    AddMember --> JoinSuccess[Display: joined group]
    JoinSuccess --> End2([End])
```

**Check-out** (staff-assisted, individual or whole group):

```mermaid
flowchart TD
    Start([Start]) --> Scan[Customer scans NFC tag]
    Scan --> Validate[Validate NFC tag]
    Validate --> Find[Find member's group / session]
    Find --> ShowScreens[Hardware shows group screen +\nstaff admin web shows active table\nand who is scanning]
    ShowScreens --> Decide{Staff selects\ncheck-out type}
    Decide -- Individual --> PriceOne[Staff tells individual price]
    PriceOne --> PayOne[Customer pays]
    PayOne --> CheckOutOne[Staff clicks check-out for this member]
    CheckOutOne --> RemoveMember[Remove member from group\nkeep rest of group checked in]
    RemoveMember --> GroupEmpty{Group now empty?}
    GroupEmpty -- Yes --> CloseGroup[Close group session]
    GroupEmpty -- No --> End1([End])
    CloseGroup --> End1
    Decide -- Whole group --> PriceAll[Staff tells overall group price]
    PriceAll --> PayAll[Customer pays for group]
    PayAll --> CheckOutAll[Staff clicks group check-out]
    CheckOutAll --> CloseAll[Close every member's session at once]
    CloseAll --> End2([End])
```

### 4.3 Sequence Diagram

**Check-in — group forms before playing, then a later friend joins:**

```mermaid
sequenceDiagram
    actor A as Customer A
    actor B as Customer B
    participant R as NFC Reader
    participant Sys as Backend System
    participant DB as Database

    rect rgb(240, 248, 255)
    note over A,DB: Check-in — start group
    A->>R: Scan NFC tag
    R->>Sys: Read tag ID
    Sys->>DB: Validate tag + check table for active group
    DB-->>Sys: No active group at table
    Sys->>DB: Create group + session (check-in time)
    DB-->>Sys: Group created
    Sys-->>R: Check-in success (waiting for group)
    R-->>A: Show "waiting for friends"
    end

    rect rgb(255, 250, 235)
    note over A,DB: Later — Customer B joins the same group
    A->>R: Scan NFC tag (open group screen)
    R-->>A: Show group screen
    B->>R: Scan NFC tag
    R->>Sys: Read tag ID
    Sys->>DB: Validate tag + find active group at table
    DB-->>Sys: Group found
    Sys->>DB: Add B to group (check-in time)
    DB-->>Sys: Member added
    Sys-->>R: Check-in success (joined group)
    R-->>B: Confirm A and B are in the same group
    end
```

**Check-out — individual member, then whole group:**

```mermaid
sequenceDiagram
    actor A as Customer A
    participant R as NFC Reader
    participant Sys as Backend System
    participant DB as Database
    actor St as Staff (admin web)

    rect rgb(240, 248, 255)
    note over A,St: Check-out — individual member
    A->>R: Scan NFC tag
    R->>Sys: Read tag ID
    Sys->>DB: Find member's group / session
    DB-->>Sys: Group + members
    Sys-->>R: Show group screen
    Sys-->>St: Update admin view (active table + who is scanning)
    St->>A: Tell individual price
    A->>St: Pay
    St->>Sys: Check-out this member
    Sys->>DB: End member's session, keep rest of group open
    DB-->>Sys: Updated
    Sys-->>R: Check-out success (member)
    end

    rect rgb(255, 250, 235)
    note over A,St: Later — whole group leaves together
    A->>R: Scan NFC tag
    R->>Sys: Read tag ID
    Sys->>DB: Find group / session
    DB-->>Sys: Group + members
    Sys-->>R: Show group screen
    Sys-->>St: Update admin view (active table + who is scanning)
    St->>A: Tell overall group price
    A->>St: Pay for group
    St->>Sys: Group check-out
    Sys->>DB: End every member's session in the group
    DB-->>Sys: Group closed
    Sys-->>R: Check-out success (group)
    end
```

### 4.4 Class Diagram

```mermaid
classDiagram
    class Customer {
        +int customerId
        +string name
        +checkIn()
        +checkOut()
    }

    class NFCTag {
        +string tagId
        +string status
        +boolean isActive
        +validateTag()
    }

    class Group {
        +int groupId
        +string tableId
        +string status
        +datetime startTime
        +addMember()
        +removeMember()
        +closeGroup()
    }

    class Session {
        +int sessionId
        +datetime checkInTime
        +datetime checkOutTime
        +string status
        +createSession()
        +endSession()
    }

    class Staff {
        +int staffId
        +string name
        +viewActiveSessions()
        +checkOutMember()
        +checkOutGroup()
    }

    Customer "1" --> "1" NFCTag : uses
    NFCTag "1" --> "0..*" Session : identifies
    Customer "1" --> "0..*" Session : has
    Group "1" --> "1..*" Session : contains
    Staff "1" --> "0..*" Group : monitors
    Staff "1" --> "0..*" Session : views active sessions
```