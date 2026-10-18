// В релизе не открываем консольное окно на Windows
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    cyberhack_lib::run()
}
