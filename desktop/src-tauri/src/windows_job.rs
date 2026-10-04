//! Windows: keep the server and everything it starts tied to this app.
//!
//! Windows has no process groups to signal, and killing node.exe leaves its
//! children (an iperf3 mid-test, a netsh, the cmd.exe around them) running.
//! So the server goes into a Job Object created with KILL_ON_JOB_CLOSE:
//! processes it starts join the job automatically (also "detached" ones), and
//!
//! - quitting calls `kill_all`, which ends the whole tree at once;
//! - if this app dies instead (crash, Task Manager, `taskkill /F`), Windows
//!   closes our handle to the job and that ends the tree too.
//!
//! The handle is not inheritable, so node.exe never holds the job open itself.
//! Only the server is put in the job, not this process: `app.restart()` starts
//! the new instance from here, and it must not die with the old one.

use std::os::windows::io::AsRawHandle;
use std::process::Child;
use std::sync::OnceLock;

use windows_sys::Win32::Foundation::HANDLE;
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
    SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

struct Job(HANDLE);
// A job handle is a kernel handle: usable from any thread.
unsafe impl Send for Job {}
unsafe impl Sync for Job {}

/// Created on first use and never closed: the handle closes when this process
/// exits, however it exits, which is what triggers KILL_ON_JOB_CLOSE.
static JOB: OnceLock<Option<Job>> = OnceLock::new();

fn job() -> Option<&'static Job> {
    JOB.get_or_init(|| unsafe {
        let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if handle.is_null() {
            eprintln!("wifi-heatmapper: CreateJobObject failed: {}", std::io::Error::last_os_error());
            return None;
        }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let ok = SetInformationJobObject(
            handle,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const _,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        if ok == 0 {
            eprintln!("wifi-heatmapper: SetInformationJobObject failed: {}", std::io::Error::last_os_error());
            return None;
        }
        Some(Job(handle))
    })
    .as_ref()
}

/// Put a just-started server in the job. node.exe takes a good fraction of a
/// second to load before it can start anything itself, so its children are in
/// the job too. Without a job (it failed, which it should not on Windows 8+)
/// the server still exits when its stdin closes; only its children may linger.
pub fn contain(child: &Child) {
    let Some(job) = job() else { return };
    let ok = unsafe { AssignProcessToJobObject(job.0, child.as_raw_handle() as HANDLE) };
    if ok == 0 {
        eprintln!("wifi-heatmapper: AssignProcessToJobObject failed: {}", std::io::Error::last_os_error());
    }
}

/// End the server and everything it started.
pub fn kill_all() {
    if let Some(job) = JOB.get().and_then(Option::as_ref) {
        unsafe { TerminateJobObject(job.0, 1) };
    }
}
